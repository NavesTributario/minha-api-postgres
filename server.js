const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rota de teste
app.get('/', (req, res) => {
  res.json({ 
    message: 'API funcionando! 🚀',
    timestamp: new Date().toISOString()
  });
});

// Rotas principais
const routes = require('./routes');
app.use('/api', routes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🌟 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`📊 Teste: http://localhost:${PORT}/api/tabelas`);
});