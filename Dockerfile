# Etapa de construcción y ejecución unificada
FROM --platform=linux/amd64 node:18-slim

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias del backend
# Agregamos .dockerignore para asegurar que no se pase node_modules local
COPY backend/package*.json ./backend/

# Instalar dependencias del backend (limpio)
RUN cd backend && npm cache clean --force && npm install --production

# Copiar el código del backend y del frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Exponer el puerto que usa Express
EXPOSE 3000

# Variables de entorno por defecto (pueden ser sobrescritas en docker-compose)
ENV PORT=3000
ENV NODE_ENV=production

# Comando para iniciar la aplicación desde la carpeta backend
CMD ["node", "backend/server.js"]
