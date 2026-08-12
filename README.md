# Rotina — João

App pessoal de dieta, treino e evolução física. PWA instalável no iPhone.

## Arquivos
- `index.html` — estrutura das telas
- `style.css` — visual (modo escuro, cards, timeline)
- `script.js` — toda a lógica (rotina por dia da semana, checklist, água, substituições, peso, fotos, backup)
- `manifest.json` — configuração da instalação como app
- `sw.js` — service worker, permite abrir offline depois da 1ª visita
- `icon-192.png` e `icon-512.png` — ícones usados no manifest e na tela inicial

## Como publicar no GitHub Pages
1. Crie um repositório novo no GitHub (ex: `rotina-joao`).
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. No repositório, vá em **Settings → Pages**, escolha a branch `main` e a pasta `/root`, salve.
4. Aguarde alguns minutos — o GitHub mostrará o link, algo como `https://seu-usuario.github.io/rotina-joao/`.

## Como instalar no iPhone
1. Abra o link acima no **Safari** (precisa ser o Safari, não outro navegador).
2. Toque no ícone de compartilhar (quadrado com seta para cima).
3. Toque em **"Adicionar à Tela de Início"**.
4. Pronto — o app abre em tela cheia, com ícone próprio, e funciona offline depois da primeira visita.

## Sobre os dados
- Tudo fica salvo neste aparelho, no navegador (localStorage + IndexedDB para fotos).
- Use o botão **Exportar dados (JSON)** em Perfil regularmente — é o backup que te permite recuperar tudo caso troque de celular ou limpe os dados do Safari.
- Fotos de progresso ficam só neste aparelho (não entram no backup, por serem grandes).
- Os números de calorias/proteína são estimativas de referência, ajustáveis em Perfil — não é prescrição médica.

## Testando localmente antes de publicar
Como o app usa `fetch`/service worker, alguns navegadores bloqueiam esses recursos se você simplesmente abrir o `index.html` direto do disco (`file://`). Para testar localmente:

```bash
# dentro da pasta do projeto
python3 -m http.server 8000
# depois abra http://localhost:8000 no navegador
```
