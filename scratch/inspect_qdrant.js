const axios = require('axios');
require('dotenv').config({ path: './backend/.env' });

const QDRANT_URL = process.env.QDRANT_URL.replace(/\/$/, '');
const QDRANT_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = process.env.QDRANT_COLLECTION;

async function inspectQdrant() {
    console.log(`🔍 Inspeccionando Qdrant: ${QDRANT_URL}`);
    console.log(`Collection: ${COLLECTION}`);

    try {
        // 1. Ver info de la colección
        const info = await axios.get(`${QDRANT_URL}/collections/${COLLECTION}`, {
            headers: { 'api-key': QDRANT_KEY }
        });
        console.log('\n✅ Info de la Colección:');
        console.log(`- Puntos totales: ${info.data.result.points_count}`);
        console.log(`- Dimensión configurada: ${info.data.result.config.params.vectors.size}`);
        console.log(`- Estado: ${info.data.result.status}`);

        // 2. Intentar listar los últimos 5 puntos
        const points = await axios.post(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
            limit: 5,
            with_payload: true
        }, {
            headers: { 'api-key': QDRANT_KEY }
        });

        console.log('\n📍 Últimos Puntos Guardados:');
        if (points.data.result.points.length === 0) {
            console.log('❌ La colección está VACÍA.');
        } else {
            points.data.result.points.forEach(p => {
                console.log(`- ID: ${p.id} | Acción: ${p.payload.action_type} | Msg: ${p.payload.user_message.slice(0, 50)}...`);
            });
        }

    } catch (error) {
        console.error('❌ Error inspeccionando Qdrant:', error.response?.data || error.message);
    }
}

inspectQdrant();
