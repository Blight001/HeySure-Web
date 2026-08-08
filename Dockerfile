FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim

WORKDIR /app

COPY package.json ./

# 安装依赖
RUN npm install -g cnpm --registry=https://registry.npmmirror.com && cnpm install

COPY . .

# 镜像构建阶段预编译并压缩所有前端模块，避免线上首次访问由 Vite 临时转换数百个源码模块。
RUN npm run build

EXPOSE 58150

# preview 仅提供预构建产物，同时继续复用 vite.config.ts 中的 API / Socket.IO 反向代理。
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "58150"]
