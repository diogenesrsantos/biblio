FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
RUN mkdir -p /app/data/media
ENV PORT=8080
ENV DATA_DIR=/app/data
EXPOSE 8080
CMD ["npm", "start"]
