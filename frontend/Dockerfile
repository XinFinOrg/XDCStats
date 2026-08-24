FROM node:26-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install
RUN npm install -g serve

COPY . .

EXPOSE 32001
CMD ["sh", "-c", "npm run build && serve -s dist -l 32001"]
