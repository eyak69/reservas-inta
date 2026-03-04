-- Creación de la base de datos si no existe
CREATE DATABASE IF NOT EXISTS reservas_inta CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE reservas_inta;

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role ENUM('usuario', 'admin') DEFAULT 'usuario',
    is_active BOOLEAN DEFAULT TRUE,
    reset_token VARCHAR(255) NULL,
    reset_token_expiry DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla de Espacios
CREATE TABLE IF NOT EXISTS spaces (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla de Reservas
CREATE TABLE IF NOT EXISTS reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    space_id INT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status ENUM('pendiente', 'aprobada', 'rechazada', 'cancelada') DEFAULT 'aprobada',
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Tabla de Logs de Auditoría (Sistema de Trazabilidad)
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NULL,
    entity_id INT NULL,
    space_id INT NULL,
    details JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_created_user (created_at, user_id)
);

-- Ejemplo de inserción de espacios genéricos
INSERT INTO spaces (name, description) VALUES 
('Auditorio Principal', 'Gran auditorio para charlas y eventos'),
('Sala de Reuniones A', 'Sala mediana con proyector'),
('Laboratorio Compartido', 'Espacio técnico con equipamiento básico')
ON DUPLICATE KEY UPDATE name=name;

-- ==========================================================
-- SECCIÓN DE MIGRACIONES (Para bases ya existentes en PROD)
-- ==========================================================

-- 1. Agregar campos de reset de contraseña
-ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL, ADD COLUMN reset_token_expiry DATETIME NULL;

-- 2. Crear tabla de auditoría (si no existía)
CREATE TABLE IF NOT EXISTS activity_logs (
     id INT AUTO_INCREMENT PRIMARY KEY,
     user_id INT NULL,          -- Permite SET NULL para no borrar el log
     action VARCHAR(100) NOT NULL,
     entity VARCHAR(100) NULL,
     entity_id INT NULL,
     space_id INT NULL,         -- Agregamos índice aquí abajo
     details JSON NULL,
     ip_address VARCHAR(45) NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     
     -- Mantiene el rastro aunque el usuario sea eliminado
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
     
     -- Índices optimizados para las consultas que realmente vamos a hacer
     INDEX idx_recent_activity (created_at DESC), -- Para el feed global
     INDEX idx_space_history (space_id, created_at DESC), -- Para ver qué pasó en una sala
     INDEX idx_user_tracker (user_id, created_at DESC) -- Para ver qué hizo un usuario
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

