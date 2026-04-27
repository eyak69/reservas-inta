const axios = require('axios');
require('dotenv').config({ path: './backend/.env' });

const API_URL = `http://localhost:${process.env.PORT || 3001}/api/chat/message`;
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJjZmFudG9uQGdtYWlsLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NzE0MTM1OSwiZXhwIjoxNzc3MTQ0OTU5fQ._8Z2GmcrFn45OFR987b7f52vn1aoJR-SKPhE4brpLkw';

async function chat(msg) {
    console.log(`\n👤 Usuario: ${msg}`);
    await new Promise(r => setTimeout(r, 2000)); // Espera de 2s para estabilidad
    const res = await axios.post(API_URL, { message: msg }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });
    console.log(`🤖 Asistente: ${res.data.reply}`);
    return res.data;
}

async function deepTest() {
    console.log('🔥 INICIANDO AUDITORÍA PROFUNDA DE FLUJO Y APRENDIZAJE 🔥');
    console.log('---------------------------------------------------------');

    try {
        // 1. Listar
        await chat('Hola, ¿me podrías decir qué salas tienen disponibles hoy?');

        // 2. Disponibilidad
        await chat('¿Está libre la Sala 1 para este lunes a las 10 de la mañana?');

        // 3. Reservar
        await chat('Perfecto, reservame la Sala 1 para este lunes a las 10:00 por 2 horas. El motivo es "Capacitación de Seguridad".');

        // 4. Consultar
        await chat('¿Me podés mostrar qué reservas tengo a mi nombre?');

        // 5. Cancelar con lenguaje natural
        await chat('Sabés qué, mejor cancelá la reserva que acabamos de hacer, se me complicó el horario.');

        // 6. Verificación final
        await chat('¿Me quedó alguna reserva pendiente o ya está todo cancelado?');

        console.log('\n---------------------------------------------------------');
        console.log('✅ FLUJO FINALIZADO: El bot debería haber usado listar_espacios, crear_reserva, mis_reservas y cancelar_reserva.');
        console.log('💡 Revisá la consola del backend para confirmar el uso de tools.');

    } catch (error) {
        console.error('❌ Error en el test profundo:', error.response?.data || error.message);
        if (error.response?.data?.debug) {
            console.error('🔍 Detalle Técnico (DEBUG):', error.response.data.debug);
        }
    }
}

deepTest();
