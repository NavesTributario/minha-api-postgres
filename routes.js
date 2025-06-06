const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

// Conexão PostgreSQL com SSL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false // Aceita certificados auto-assinados
  },
  // Configurações adicionais para conexões remotas
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

// Teste de conexão
pool.on('connect', () => {
  console.log('✅ Conectado ao PostgreSQL!');
});

pool.on('error', (err) => {
  console.error('❌ Erro PostgreSQL:', err.message);
});

// ROTA: Listar todos os schemas disponíveis
router.get('/schemas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schema_name
    `);
    
    res.json({
      success: true,
      schemas: result.rows.map(row => row.schema_name)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      erro: error.message
    });
  }
});

// ROTA: Listar tabelas e views de um schema específico
router.get('/schema/:schema/objetos', async (req, res) => {
  try {
    const { schema } = req.params;
    
    // Validação do nome do schema
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      return res.status(400).json({
        success: false,
        erro: 'Nome de schema inválido'
      });
    }
    
    const result = await pool.query(`
      SELECT 
        table_name,
        table_type,
        CASE 
          WHEN table_type = 'VIEW' THEN 'view'
          ELSE 'table'
        END as tipo
      FROM information_schema.tables 
      WHERE table_schema = $1
      ORDER BY table_type, table_name
    `, [schema]);
    
    res.json({
      success: true,
      schema: schema,
      objetos: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      erro: error.message
    });
  }
});

// ROTA: Buscar dados de uma view/tabela específica
router.get('/dados/:schema/:objeto', async (req, res) => {
  try {
    const { schema, objeto } = req.params;
    const { limit = 100 } = req.query;
    
    // Validação dos nomes
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) || 
        !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(objeto)) {
      return res.status(400).json({
        success: false,
        erro: 'Nome de schema ou objeto inválido'
      });
    }
    
    // Query com schema específico
    const query = `SELECT * FROM ${schema}.${objeto} LIMIT $1`;
    const result = await pool.query(query, [limit]);
    
    res.json({
      success: true,
      schema: schema,
      objeto: objeto,
      total: result.rows.length,
      dados: result.rows
    });
  } catch (error) {
    console.error('Erro na consulta:', error.message);
    res.status(500).json({
      success: false,
      erro: error.message,
      detalhes: `Tentativa de acessar: ${schema}.${objeto}`
    });
  }
});

// ROTA: CSV para Google Sheets
router.get('/csv/:schema/:objeto', async (req, res) => {
  try {
    const { schema, objeto } = req.params;
    const { limit = 1000 } = req.query;
    
    // Validação dos nomes
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) || 
        !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(objeto)) {
      return res.status(400).send('Nome de schema ou objeto inválido');
    }
    
    const query = `SELECT * FROM ${schema}.${objeto} LIMIT $1`;
    const result = await pool.query(query, [limit]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('Nenhum dado encontrado');
    }
    
    // Gerar CSV
    const headers = Object.keys(result.rows[0]);
    const csvContent = [
      headers.join(','),
      ...result.rows.map(row => 
        headers.map(header => {
          let value = row[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            value = `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${schema}_${objeto}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Erro CSV:', error.message);
    res.status(500).send(`Erro: ${error.message}`);
  }
});

// ROTA: Consulta SQL customizada (para casos específicos)
router.post('/consulta', async (req, res) => {
  try {
    const { sql, params = [] } = req.body;
    
    if (!sql) {
      return res.status(400).json({
        success: false,
        erro: 'SQL é obrigatório'
      });
    }
    
    // Validação básica de segurança
    const sqlLower = sql.toLowerCase().trim();
    if (!sqlLower.startsWith('select')) {
      return res.status(400).json({
        success: false,
        erro: 'Apenas consultas SELECT são permitidas'
      });
    }
    
    const result = await pool.query(sql, params);
    
    res.json({
      success: true,
      total: result.rows.length,
      dados: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      erro: error.message
    });
  }
});

// ROTA: Informações sobre uma view específica
router.get('/info/:schema/:view', async (req, res) => {
  try {
    const { schema, view } = req.params;
    
    // Buscar informações da view
    const result = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schema, view]);
    
    res.json({
      success: true,
      schema: schema,
      view: view,
      colunas: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      erro: error.message
    });
  }
});

module.exports = router;