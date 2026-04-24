require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(express.json());
app.use(cors());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Mantendo seu System Instruction aprimorado
const SYSTEM_INSTRUCTION = `Você é o 'Especialista MSEP SC'. Sua missão é criar itens de avaliação objetiva (múltipla escolha) seguindo rigorosamente a Metodologia SENAI de Educação Profissional.

DIRETRIZES TÉCNICAS:
1. CONTEXTO: Deve iniciar com "Em uma indústria de... na área de...". O estudante deve ser tratado como o profissional (Técnico). O contexto deve apresentar um problema factível e relevante da rotina industrial. Máximo 1 parágrafo.
2. COMANDO: Pergunta direta, clara e impessoal. 
   - PROIBIDO: "Assinale a correta", "Exceto", "Não", "Incorreto", "Sempre", "Nunca".
   - O comando deve ser suficiente para que o aluno entenda o problema antes de ler as alternativas.
3. TAXONOMIA DE BLOOM: O verbo do comando e a complexidade do item DEVEM ser coerentes com o nível cognitivo da capacidade avaliada (ou forçados conforme instrução de raciocínio).
4. ALTERNATIVAS (A, B, C, D):
   - GABARITO: Única resposta correta, sem atrativos óbvios.
   - DISTRATORES: Devem ser plausíveis (erros que um aluno que ainda não domina a capacidade cometeria). Não use "pegadinhas".
5. JUSTIFICATIVA: Para cada distrator, explique a hipótese de raciocínio do estudante (ex: "O aluno confundiu o conceito X com Y").

NÍVEIS COGNITIVOS (Referência):
- Lembrar (Identificar, Listar)
- Entender (Descrever, Explicar)
- Aplicar (Executar, Medir)
- Analisar (Diferenciar, Testar, Inspecionar)
- Avaliar (Validar, Julgar)
- Criar (Projetar, Elaborar)`;

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

    // Passo 1: Prompt de Raciocínio (Mantendo o seu e integrando contexto de aula)
    const promptRaciocinio = [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: `Analise tecnicamente a capacidade: "${capacidade}". 
      ${contextoAulas ? `CONTEXTO ADICIONAL DA AULA: "${contextoAulas}"` : ""}

      TAREFAS:
      1. Identifique o verbo principal e o nível original na Taxonomia de Bloom.
      2. Defina o Objeto de Conhecimento central, priorizando o que foi trabalhado em aula se houver contexto.
      3. SE ${dificil} (Modo Difícil): Force o nível 'ANALISAR'. O item deve focar em diagnóstico de falha ou análise de causa/efeito.
      4. SE NÃO: Siga o nível original da capacidade.

      Retorne JSON: {
          "verbo_identificado": "...",
          "nivel_cognitivo": "...",
          "complexidade": "${dificil ? 'Alta (Diagnóstico)' : 'Padrão'}",
          "estrategia_didatica": "Explique como o contexto industrial e os temas da aula serão unidos"
      }` }
    ];

    try {
        const analise = await chamarIA(promptRaciocinio);

        // Passo 2: Geração da Questão Final com a nova regra de distratores
        const promptQuestao = [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: `Com base nesta análise: ${JSON.stringify(analise)}, crie uma questão para: "${capacidade}".
            
            REGRAS ADICIONAIS:
            ${distratoresDificeis ? "- DISTRATORES DIFÍCEIS: Os distratores devem ser da mesma categoria técnica da resposta. Ex: Se o gabarito é um comando UPDATE, use outros comandos de alteração/sintaxe parecida como distratores. Evite misturar verbos SQL totalmente diferentes (SELECT/DELETE)." : ""}
            - AUTO-CONTENÇÃO: A questão deve ser completa. NÃO mencione "conforme visto em aula" ou "com base na explicação do professor". 
            - FOCO EM AULA: Se foi fornecido contexto de aula, use os exemplos técnicos de lá para compor a Situação-Problema.

            Retorne JSON: {
                "verbo_aplicado": "${analise.verbo_identificado}",
                "nivel": "${analise.nivel_cognitivo}",
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
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(3000, () => console.log('🚀 Sistema MSEP SC rodando no Groq!'));