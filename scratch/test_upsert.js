const vectorService = require('./backend/services/vectorService');
require('dotenv').config({ path: './backend/.env' });

async function testUpsert() {
    console.log('🧪 Probando Upsert Manual...');
    try {
        const testId = Math.floor(Math.random() * 1000000);
        await vectorService.upsertFeedback(
            testId, 
            'Hola, esto es un test de guardado', 
            'Respuesta de test', 
            'test_action'
        );
        console.log('✅ Upsert enviado. Verificá si el contador de puntos subió.');
    } catch (error) {
        console.error('❌ Error capturado en el test:', error);
    }
}

testUpsert();
