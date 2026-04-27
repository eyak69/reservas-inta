const axios = require('axios');
require('dotenv').config({ path: './backend/.env' });

const API_URL = `http://localhost:${process.env.PORT || 3001}/api/chat/message`;
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJjZmFudG9uQGdtYWlsLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NzE0MTM1OSwiZXhwIjoxNzc3MTQ0OTU5fQ._8Z2GmcrFn45OFR987b7f52vn1aoJR-SKPhE4brpLkw';

async function runTest() {
    console.log('🚀 Iniciando Simulación de Aprendizaje Semántico...');

    try {
        // Paso 1: Pregunta normal
        console.log('\n[Paso 1] Usuario: "¿Qué salas tenés?"');
        const res1 = await axios.post(API_URL, { message: 'Hola che, ¿qué salas tenés?' }, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        console.log('Respuesta Bot:', res1.data.reply);

        // Paso 2: Corrección
        console.log('\n[Paso 2] Usuario lanzando CORRECCIÓN de comportamiento...');
        const correctionMsg = 'No, te dije que cuando te pregunte qué salas tenés, me digas siempre primero si el Club está libre y con un tono bien amiguero.';
        const res2 = await axios.post(API_URL, { message: correctionMsg }, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        console.log('Respuesta Bot:', res2.data.reply);
        console.log('💡 El Auditor debería estar procesando esto en background...');

        // Esperar un poco para que el auditor termine (Gemini Pro tarda unos segundos)
        console.log('\n⏳ Esperando 15 segundos para que la IA Senior audite el error...');
        await new Promise(r => setTimeout(r, 15000));

        // Paso 3: Verificación del Aprendizaje
        console.log('\n[Paso 3] Usuario preguntando lo mismo para ver si aprendió...');
        const res3 = await axios.post(API_URL, { message: '¿Qué salas hay?' }, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        console.log('🤖 RESPUESTA FINAL (Debería incluir la preferencia aprendida):');
        console.log('------------------------------------------------------------');
        console.log(res3.data.reply);
        console.log('------------------------------------------------------------');

        if (res3.data.reply.toLowerCase().includes('club')) {
            console.log('\n✅ TEST EXITOSO: El bot recordó la preferencia semántica.');
        } else {
            console.log('\n⚠️ TEST PARCIAL: El bot respondió pero tal vez no priorizó el aprendizaje. Revisar logs de Qdrant.');
        }

    } catch (error) {
        console.error('❌ Error en el test:', error.response?.data || error.message);
    }
}

runTest();
