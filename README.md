# Curious — Por que tão curioso?

One page de uma marca fictícia ("Mocho", app de ciência para crianças) com a corujinha **Tito**, mascote que segue o cursor do mouse olhando em todas as direções.

**Site:** https://flaviohorbach.github.io/curious/

Projeto de estudo inspirado no template "Why so curious?" do Figma for Motion.

## Como foi feito

- **WordPress + Elementor** (tema filho do Astra), desenvolvido localmente no LocalWP. Este repositório é a **exportação estática** da página, para ela rodar no GitHub Pages sem PHP nem banco de dados.
- **Mascote a partir de vídeo gerado por IA:** um vídeo da coruja virando a cabeça foi quebrado em quadros, com o fundo removido por script em Python (PIL/NumPy) e salvo em WebP com transparência. Em cada quadro é medida a posição do bico (direção do olhar); os quadros formam um "anel" ordenado por ângulo.
- **Seguir o cursor:** em `mascote.js`, o vetor cabeça → cursor escolhe o ponto do anel, com mola amortecida e mistura dos quadros vizinhos num canvas, para a virada ficar fluida. Nos trechos em que o vídeo girava rápido demais, quadros intermediários foram sintetizados com interpolação de movimento do ffmpeg.
- **Animações:** GSAP + ScrollTrigger e rolagem suave com Lenis. A coruja muda de pose em cada seção e "senta" no rodapé.

## Estrutura

- `index.html` — a página exportada
- `wp-content/themes/curious/assets/` — CSS, JS (`curious.js`, `mascote.js`), fontes e os quadros da coruja (`img/coruja/`)
- `wp-content/plugins/elementor/`, `wp-content/themes/astra/`, `wp-includes/` — arquivos do WordPress que a página usa
