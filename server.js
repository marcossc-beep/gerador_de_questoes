require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const groq = new Groq({ apiKey: process.env.groq_api_key });

// Função para ler os exemplos do arquivo JSON
function carregarExemplos() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'questoes_exemplo.json'), 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Erro ao carregar questoes_exemplo.json:", err);
        return [];
    }
}

// INSTRUÇÃO DO SISTEMA - Definição da "Personalidade" e Regras MSEP
const SYSTEM_INSTRUCTION = `Você é o 'Especialista MSEP SC'. Sua missão é criar itens de avaliação profissional seguindo a Metodologia SENAI.

REGRAS DE OURO:
1. CONTEXTO PROFISSIONAL: O item deve começar com "Em uma indústria de... na área de...". O estudante é um TÉCNICO resolvendo um problema real.
2. COMANDO LIMPO: Proibido usar "exceto", "incorreto", "não", "assinale a alternativa". O comando deve ser uma pergunta direta que pode ser respondida sem ler as alternativas.
3. DISTRATORES HOMOGÊNEOS: Se a resposta é um componente, todos os distratores devem ser componentes da mesma família. Se é um cálculo, todos devem ser resultados de erros lógicos de cálculo.
4. JUSTIFICATIVA PEDAGÓGICA: Deve ser um texto único (string) explicando por que a correta está certa e qual foi o erro de raciocínio técnico em cada distrator.`;

async function chamarIA(messages) {
    const completion = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.6,
        response_format: { "type": "json_object" }
    });
    return JSON.parse(completion.choices[0].message.content);
}

app.post('/gerar-questao', async (req, res) => {
    const { capacidade, dificil, contextoAulas, distratoresDificeis } = req.body;
    const exemplos = carregarExemplos();

    // PASSO 1: ANÁLISE TÉCNICA E PEDAGÓGICA (Raciocínio)
    const promptRaciocinio = [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: `Analise a capacidade: "${capacidade}".
        
        TAREFAS:
        1. Identifique o Verbo e o Nível Bloom Original.
        2. Se o modo difícil estiver ativo (${dificil}), eleve obrigatoriamente para 'ANALISAR'.
        3. Planeje a "Estratégia do Erro": Que tipo de falha técnica comum um aluno cometeria aqui?
        
        Retorne JSON: {
            "verbo": "...",
            "nivel_bloom": "...",
            "objeto_conhecimento": "...",
            "estrategia_distratores": "Descreva como os erros serão construídos para serem plausíveis"
        }` }
    ];

    try {
        const analise = await chamarIA(promptRaciocinio);

        // PASSO 2: GERAÇÃO DA QUESTÃO (Aplicação do Few-Shot com os exemplos do JSON)
        const promptQuestao = [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: `Use estes exemplos como padrão de qualidade:
            ${JSON.stringify(exemplos)}

            Agora, gere uma questão inédita:
            - Capacidade: "${capacidade}"
            - Nível Cognitivo: ${analise.nivel_bloom}
            - Verbo: ${analise.verbo}
            - Contexto Adicional (Aula): ${contextoAulas || "Não fornecido"}
            - Distratores de Alta Dificuldade: ${distratoresDificeis ? "SIM" : "NÃO"}
            - Estratégia de Erro: ${analise.estrategia_distratores}

            REQUISITO DE SAÍDA: O campo 'justificativa' deve ser apenas TEXTO (string). Não use objetos ou listas dentro dele.

            Retorne JSON: {
                "verbo_aplicado": "...",
                "nivel": "...",
                "contexto": "...",
                "enunciado": "...",
                "alternativas": {"a": "...", "b": "...", "c": "...", "d": "..."},
                "correta": "letra",
                "justificativa": "..."
            }` }
        ];

        const questao = await chamarIA(promptQuestao);
        res.json(questao);

    } catch (e) {
        console.error("Erro no processamento:", e);
        res.status(500).json({ error: "Falha ao gerar questão técnica." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Agente MSEP SC rodando na porta ${PORT}`));