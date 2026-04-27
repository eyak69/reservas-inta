const pool = require('../config/db');

// Ejecuta todas las migraciones al arrancar el servidor.
// Usa CREATE TABLE IF NOT EXISTS y ALTER TABLE solo si la columna no existe.
// Es idempotente — se puede correr N veces sin romper nada.

async function runMigrations() {
    console.log('[Migrate] Iniciando migraciones...');
    const conn = await pool.getConnection();

    try {
        // ── 1. Tabla users ────────────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                google_id           VARCHAR(255) UNIQUE NULL,
                email               VARCHAR(255) UNIQUE NOT NULL,
                password            VARCHAR(255) NULL,
                name                VARCHAR(255) NOT NULL,
                avatar_url          TEXT,
                role                ENUM('usuario','admin') DEFAULT 'usuario',
                is_active           BOOLEAN DEFAULT TRUE,
                reset_token         VARCHAR(255) NULL,
                reset_token_expiry  DATETIME NULL,
                link_token          VARCHAR(20) UNIQUE NULL,
                link_token_expiry   DATETIME NULL,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        // Evolución de la tabla users (Regla 14)
        for (const col of [
            'ADD COLUMN link_token        VARCHAR(20) UNIQUE NULL AFTER reset_token_expiry',
            'ADD COLUMN link_token_expiry DATETIME NULL AFTER link_token',
            'ADD COLUMN is_verified       BOOLEAN DEFAULT FALSE AFTER link_token_expiry',
            'ADD COLUMN verification_code VARCHAR(6) NULL AFTER is_verified'
        ]) {
            try { await conn.query(`ALTER TABLE users ${col}`); } catch (e) { /* ya existe */ }
        }

        // ── 2. Tabla spaces ───────────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS spaces (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                name        VARCHAR(255) NOT NULL,
                description TEXT,
                image_url   TEXT,
                is_active   BOOLEAN DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 3. Tabla reservations ─────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                user_id    INT NOT NULL,
                space_id   INT NOT NULL,
                start_time DATETIME NOT NULL,
                end_time   DATETIME NOT NULL,
                status     ENUM('pendiente','aprobada','rechazada','cancelada') DEFAULT 'pendiente',
                comments   TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
                FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 4. Tabla activity_logs ────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                user_id    INT NULL,
                action     VARCHAR(100) NOT NULL,
                entity     VARCHAR(100) NULL,
                entity_id  INT NULL,
                space_id   INT NULL,
                details    JSON NULL,
                ip_address VARCHAR(45) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_created_user   (created_at, user_id),
                INDEX idx_recent_activity (created_at DESC),
                INDEX idx_space_history  (space_id, created_at DESC),
                INDEX idx_user_tracker   (user_id,  created_at DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 5. Tabla ai_models ───────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS ai_models (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                provider            VARCHAR(50) NOT NULL,
                model_id            VARCHAR(150) NOT NULL,
                is_active           BOOLEAN DEFAULT TRUE,
                priority            INT DEFAULT 100,
                intelligence_score  INT DEFAULT 50,
                context_window      INT NULL,
                max_output_tokens   INT NULL,
                tokens_per_sec      INT NULL,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_provider_model (provider, model_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        // Agregar columnas nuevas si la tabla ya existía sin ellas
        for (const col of [
            'ADD COLUMN context_window    INT NULL AFTER priority',
            'ADD COLUMN max_output_tokens INT NULL AFTER context_window',
            'ADD COLUMN tokens_per_sec    INT NULL AFTER max_output_tokens',
            'ADD COLUMN avg_response_ms   INT NULL AFTER tokens_per_sec',
            'ADD COLUMN call_count        INT NOT NULL DEFAULT 0 AFTER avg_response_ms',
            'ADD COLUMN last_error        TEXT NULL AFTER call_count',
            'ADD COLUMN error_at          DATETIME NULL AFTER last_error',
            'ADD COLUMN intelligence_score INT DEFAULT 50 AFTER priority',
        ]) {
            try { await conn.query(`ALTER TABLE ai_models ${col}`); } catch (e) { /* ya existe */ }
        }

        // ── 6. Tabla chat_feedback ────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS chat_feedback (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                user_message  TEXT NOT NULL,
                model_reply   TEXT NOT NULL,
                tools_used    JSON NULL,
                action_type   VARCHAR(50) NULL,
                was_success   BOOLEAN DEFAULT TRUE,
                times_seen    INT DEFAULT 1,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_action (action_type, was_success)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 7. Tabla chat_messages ────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                user_id       INT NOT NULL,
                session_id    VARCHAR(20) NOT NULL,
                role          ENUM('user','model') NOT NULL,
                message       TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
                system_prompt TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
                model_used    VARCHAR(60) NULL,
                tokens_input  INT NULL,
                tokens_output INT NULL,
                tools_called  JSON NULL,
                duration_ms   INT NULL,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_chat (user_id, created_at DESC),
                INDEX idx_session   (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 8. Tabla external_identities ─────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS external_identities (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                user_id      INT NOT NULL,
                provider     ENUM('telegram') NOT NULL,
                external_id  VARCHAR(100) NOT NULL,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_ext_user (provider, external_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 9. Tabla notifications (Regla 1) ──────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                user_id    INT NULL,
                title      VARCHAR(255) NOT NULL,
                message    MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
                type       VARCHAR(50) DEFAULT 'info',
                is_read    BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_notif (user_id, is_read),
                INDEX idx_recent_notif (created_at DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 6. Datos iniciales de espacios (solo si la tabla está vacía) ──────
        const [[{ total }]] = await conn.query('SELECT COUNT(*) as total FROM spaces');
        if (total === 0) {
            await conn.query(`
                INSERT INTO spaces (name, description) VALUES
                ('Auditorio Principal',    'Gran auditorio para charlas y eventos'),
                ('Sala de Reuniones A',    'Sala mediana con proyector'),
                ('Laboratorio Compartido', 'Espacio técnico con equipamiento básico')
            `);
            console.log('[Migrate] Espacios iniciales insertados.');
        }

        console.log('[Migrate] ✓ Todas las migraciones completadas.');
    } catch (error) {
        console.error('[Migrate] ✗ Error en migración:', error.message);
        throw error;
    } finally {
        conn.release();
    }
}

module.exports = runMigrations;
