# MSG Viewer — Guia de Instalação

Aplicativo macOS nativo para visualizar arquivos **.MSG** do Outlook.

---

## Pré-requisitos (instale uma vez)

### 1. Node.js
Abra o **Terminal** (⌘ + Espaço → "Terminal") e cole:
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```
Feche e reabra o Terminal, depois:
```
nvm install 20
nvm use 20
```
Confirme com: `node --version` (deve mostrar v20.x.x)

---

## Instalação do App

### Passo 1 — Entre na pasta do projeto
No Terminal:
```
cd ~/Downloads/msg-viewer-app
```
*(Se você extraiu em outro lugar, ajuste o caminho)*

### Passo 2 — Instale as dependências
```
npm install
```
Aguarde terminar (pode levar 1–2 minutos).

### Passo 3 — Inicie o app
```
npm start
```
O MSG Viewer abrirá como um app macOS normal. ✅

---

## Como usar

| Ação | Como fazer |
|------|------------|
| Abrir .MSG | Arraste o arquivo para a janela **ou** clique em "Selecionar Arquivo" |
| Navegar entre mensagens | Clique nos itens da lista central |
| Baixar um anexo | Clique em **Baixar** ao lado do anexo |
| Baixar todos os anexos | Clique em **Download All** no topo |
| Buscar | ⌘F ou clique na barra de pesquisa |
| Navegar com teclado | Setas ↑↓ na lista de mensagens |
| Abrir arquivo recente | Sidebar → Recentes |
| Marcar favorito | Clique em "☆ Adicionar Favorito" no email aberto |
| Imprimir | Botão da impressora no toolbar |
| Mostrar no Finder | Clique em "Mostrar no Finder" |

---

## Gerar o app .dmg (opcional, para distribuir)

```
npm run build
```
O arquivo `.dmg` será gerado em `dist/`.

> **Nota:** Para distribuir fora da App Store, você precisará de uma Apple Developer Account para assinar o app.

---

## Problemas comuns

**"npm: command not found"**
→ Feche e reabra o Terminal depois de instalar o nvm.

**App não abre o .msg**
→ Verifique se o arquivo tem extensão `.msg` (não `.MSG` em maiúsculas — ambos funcionam no macOS).

**Erro "electron not found"**
→ Rode `npm install` novamente dentro da pasta do projeto.

**Arquivo muito grande**
→ O limite é 45MB por arquivo .MSG.

---

## Estrutura do projeto

```
msg-viewer-app/
├── main.js          ← Processo principal (Electron)
├── preload.js       ← Ponte segura entre processos
├── package.json     ← Dependências e configuração
└── renderer/
    ├── index.html   ← Interface do usuário
    └── app.js       ← Lógica da UI
```

---

Desenvolvido com Electron + @kenjiuno/msgreader · macOS Design System
