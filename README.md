# 💬 disparador-de-whatssap-

Aplicação em **Node.js** para disparo de mensagens via **WhatsApp Web**, usando automação de navegador.

Ideal para:
- Enviar mensagens em massa para uma lista de contatos
- Automatizar follow-ups de atendimento
- Testar campanhas de mensagens de forma controlada

---

## ⚙️ Tecnologias Utilizadas

- **Node.js**
- **Express** (servidor HTTP, se usado)
- **Socket.io** (comunicação em tempo real, se usado)
- **WhatsApp Web (wwebjs / Puppeteer)** para automação
- HTML, CSS e JavaScript no frontend (`public/`)

---

## 📂 Estrutura do Projeto

```text
disparador-de-whatssap/
├── public/
│   ├── index.html        # Interface do painel
│   └── client.js         # Lógica do frontend
├── index.js              # Servidor Node / lógica principal
├── comandos pra iniciar.txt
├── instalar pendencias.bat
├── package.json
├── package-lock.json
└── .gitignore
📦 Instalação das Dependências
No Windows, você pode rodar o arquivo instalar pendencias.bat
ou executar os comandos manualmente:

bat
Copiar código
cd /d "C:\Users\usuario\Desktop\disparador de whatssap - Copia"

:: limpar instalações antigas (opcional)
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json

:: permitir download do Chromium usado na automação
set PUPPETEER_SKIP_DOWNLOAD=

:: instalar dependências do projeto
npm install
▶️ Como Iniciar o Painel
Depois de instalar as dependências:

bash
Copiar código
npm start
Em seguida, acesse no navegador:

text
Copiar código
http://localhost:3000
Siga as instruções na tela para conectar ao WhatsApp Web e iniciar os envios.

⚠️ Aviso de Uso
Este projeto deve ser utilizado apenas para:

Comunicação com contatos que autorizaram o recebimento de mensagens

Testes e uso interno

O envio de spam ou uso indevido pode violar os Termos de Uso do WhatsApp.
Use com responsabilidade.

👨‍💻 Autor
Matheus – Cub Tecnologia Dev
Sistemas em PHP, Node.js e automação web.
📧 cubtecnologia.dev@gmail.com
