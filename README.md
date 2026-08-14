# Minha Dieta

## Etapa 6 — alimentação inteligente

- catálogo local por categoria e modo de preparo, disponível mesmo sem internet;
- cálculo automático de calorias, proteínas, carboidratos e gorduras;
- alimentos favoritos e recentes para repetir registros rapidamente;
- busca externa na Open Food Facts para produtos industrializados;
- plano alimentar importado recalculado com os quatro macronutrientes.

Os valores da base local usam principalmente a TACO/NEPA-Unicamp. Itens marcados como estimativa e produtos industrializados devem ser conferidos no rótulo.

## Controle do plano de treino

A aba Treino possui a opção **Excluir plano de treino**. Após confirmação, ela remove o plano atual, os dias programados e as marcações de treino concluído, mantendo perfil, dieta, refeições e evolução.

## Etapa 7 — plano alimentar base

- criação de uma sugestão inicial com 3 a 6 refeições;
- uso das metas de calorias e proteínas configuradas no Perfil;
- opções de objetivo, estilo alimentar, orçamento, tempo para cozinhar e carboidrato preferido;
- filtros para leite/lactose, ovo, glúten, amendoim e alimentos indesejados;
- horários distribuídos conforme acordar/dormir e identificação de pré/pós-treino;
- cálculo automático dos quatro macronutrientes;
- aviso quando a combinação de restrições não consegue se aproximar da meta;
- edição completa de cada refeição após a criação;
- bloqueio do gerador automático para menores de 18 anos.

O plano-base é apenas uma ferramenta de organização geral. Situações clínicas, gestação, alergias graves, uso de medicamentos e necessidades específicas exigem avaliação profissional.

## Etapa 8 — gamificação e desempenho

- 20 pontos ao atingir a meta diária de água;
- 5 pontos por refeição concluída, limitados a 20 por dia;
- 30 pontos por treino concluído;
- 10 pontos pelo primeiro registro de evolução da semana;
- nível a cada 300 pontos;
- pontuação de hoje, da semana e total da conta;
- sequência de dias com pelo menos uma meta principal concluída;
- conquistas progressivas;
- avisos automáticos sobre água, treino e refeições pendentes.

A pontuação é calculada diretamente a partir dos registros sincronizados da conta. A etapa social posterior usará essa base para o ranking entre amigos.

Aplicativo multiusuário de dieta, treino e evolução física. PWA instalável no celular.

## Arquivos
- `index.html` — estrutura das telas
- `style.css` — visual (modo escuro, cards, timeline)
- `script.js` — rotina, dieta editável, cálculos nutricionais, planos de treino-base, checklist, água e evolução
- `auth.js` — autenticação, sincronização e importação de PDF/DOCX
- `supabase-config.js` — endereço público e chave publicável do projeto Supabase
- `manifest.json` — configuração da instalação como app
- `sw.js` — service worker, permite abrir offline depois da 1ª visita
- `icon-192.png` e `icon-512.png` — ícones usados no manifest e na tela inicial

## Como publicar no GitHub Pages
1. Use o repositório `minha-dieta` já criado.
2. Envie todos os arquivos desta pasta para a raiz do repositório, substituindo os anteriores.
3. No repositório, vá em **Settings → Pages**, escolha a branch `main` e a pasta `/root`, salve.
4. Aguarde alguns minutos — o GitHub mostrará o link, algo como `https://seu-usuario.github.io/rotina-joao/`.

## Como instalar no iPhone
1. Abra o link acima no **Safari** (precisa ser o Safari, não outro navegador).
2. Toque no ícone de compartilhar (quadrado com seta para cima).
3. Toque em **"Adicionar à Tela de Início"**.
4. Pronto — o app abre em tela cheia, com ícone próprio, e funciona offline depois da primeira visita.

## Sobre os dados
- Os dados do usuário são salvos localmente e sincronizados com a conta pelo Supabase.
- Use o botão **Exportar dados (JSON)** em Perfil regularmente — é o backup que te permite recuperar tudo caso troque de celular ou limpe os dados do Safari.
- Fotos de progresso ficam só neste aparelho (não entram no backup, por serem grandes).
- Os números de calorias/proteína são estimativas com base na TACO/NEPA-Unicamp e nos valores informados. Marcas, porções e preparo podem alterar o resultado; não é prescrição médica.
- Os planos de treino-base são sugestões iniciais editáveis. Dor, tontura, lesões ou limitações exigem interrupção e avaliação de profissional habilitado.
- A leitura de PDF utiliza fluxo compatível com Safari/iPhone; arquivos antigos podem ser processados novamente pelo botão **Reanalisar**.
- Cada usuário pode escolher entre as paletas Preto + roxo, Espresso + cobre e Carbono + azul elétrico.
- A foto de perfil é comprimida no aparelho e salva no bucket privado `profile-avatars`, acessível somente pelo proprietário.

## Testando localmente antes de publicar
Como o app usa `fetch`/service worker, alguns navegadores bloqueiam esses recursos se você simplesmente abrir o `index.html` direto do disco (`file://`). Para testar localmente:

```bash
# dentro da pasta do projeto
python3 -m http.server 8000
# depois abra http://localhost:8000 no navegador
```
