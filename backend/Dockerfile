FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Crear carpetas para persistencia
RUN mkdir -p logs storage && chmod 777 logs storage

EXPOSE 3000

CMD ["npm", "start"]
