const axios = require('axios');

/**
 * Servicio para manejar operaciones vectoriales (Embeddings OpenAI + Qdrant)
 */
class VectorService {
    constructor() {
        this.openaiKey = process.env.OPENAI_API_KEY;
    }

    get qdrantUrl() { return (process.env.QDRANT_URL || '').replace(/\/$/, ''); }
    get qdrantKey() { return process.env.QDRANT_API_KEY; }
    get collection() { return process.env.QDRANT_COLLECTION || 'Reservas_INTA_Feedback'; }

    /**
     * Genera el vector numérico usando OpenAI (Estándar de la industria)
     */
    async generateEmbedding(text) {
        try {
            const response = await axios.post('https://api.openai.com/v1/embeddings', {
                input: text,
                model: "text-embedding-3-small"
            }, {
                headers: { 'Authorization': `Bearer ${this.openaiKey}` }
            });
            return response.data.data[0].embedding; // 1536 dimensiones
        } catch (error) {
            console.error('[VectorService] Error generando embedding OpenAI:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Asegura que la colección existe con la dimensión correcta (1536 para OpenAI)
     */
    async ensureCollection() {
        try {
            const res = await axios.get(`${this.qdrantUrl}/collections/${this.collection}`, {
                headers: { 'api-key': this.qdrantKey }
            });
            
            // Si la dimensión es distinta, hay que recrearla
            if (res.data.result.config.params.vectors.size !== 1536) {
                console.log(`[VectorService] Dimensión incorrecta. Recreando colección...`);
                await axios.delete(`${this.qdrantUrl}/collections/${this.collection}`, {
                    headers: { 'api-key': this.qdrantKey }
                });
                throw { response: { status: 404 } }; // Forzar recreación
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`[VectorService] Creando colección "${this.collection}" (1536 dims) en Qdrant...`);
                await axios.put(`${this.qdrantUrl}/collections/${this.collection}`, {
                    vectors: { size: 1536, distance: 'Cosine' }
                }, {
                    headers: { 'api-key': this.qdrantKey }
                });
            } else {
                throw error;
            }
        }
    }

    async upsertFeedback(id, userMessage, modelReply, actionType) {
        try {
            const vector = await this.generateEmbedding(userMessage);
            await axios.put(`${this.qdrantUrl}/collections/${this.collection}/points?wait=true`, {
                points: [{
                    id: id,
                    vector: vector,
                    payload: {
                        user_message: userMessage,
                        model_reply: modelReply,
                        action_type: actionType,
                        project: 'reservas_inta'
                    }
                }]
            }, {
                headers: { 'api-key': this.qdrantKey }
            });
        } catch (error) {
            console.error('[VectorService] Error en upsert:', error.message);
        }
    }

    async searchSimilar(queryText, limit = 3) {
        try {
            const vector = await this.generateEmbedding(queryText);
            const response = await axios.post(`${this.qdrantUrl}/collections/${this.collection}/points/search`, {
                vector: vector,
                limit: limit,
                with_payload: true,
                score_threshold: 0.90
            }, {
                headers: { 'api-key': this.qdrantKey }
            });

            return response.data.result.map(hit => ({
                user_message: hit.payload.user_message,
                model_reply: hit.payload.model_reply,
                score: hit.score
            }));
        } catch (error) {
            console.error('[VectorService] Error en búsqueda semántica:', error.message);
            return [];
        }
    }
}

module.exports = new VectorService();
