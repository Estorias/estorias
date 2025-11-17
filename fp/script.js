// --- VARIÁVEIS GLOBAIS DO FIREBASE (Inicializadas depois) ---
let db;
let messagesCollection;
let playersCollection;
let mapCollection;
let bulletinBoardCollection;
let bulletinStateRef;
let appInitialized = false; // Trava para não rodar listeners sem firebase

// --- FUNÇÃO 1: TENTA INICIAR AUTOMATICAMENTE ---
function checkFirebaseConfig() {
    const savedConfig = localStorage.getItem('rpg_firebase_config');
    
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            initializeFirebase(config);
        } catch (e) {
            console.error("Configuração salva inválida", e);
            openFirebaseModal();
        }
    } else {
        // Se não tem config salva, abre o modal
        openFirebaseModal();
    }
}

// --- FUNÇÃO 2: ABRIR O MODAL DE CONFIG ---
function openFirebaseModal() {
    const modal = document.getElementById('firebase-config-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Removemos a injeção dinâmica de botões pois agora está no HTML
    }
}

// --- NOVO: FUNÇÃO PARA CARREGAR O ARQUIVO JSON DA CHAVE ---
function handleKeyFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const configText = e.target.result;
            const config = JSON.parse(configText);
            
            // Validação simples para ver se parece uma chave do firebase
            if (config.apiKey && config.projectId) {
                // Salva no navegador
                localStorage.setItem('rpg_firebase_config', JSON.stringify(config));
                
                // Fecha modal
                document.getElementById('firebase-config-modal').style.display = 'none';
                
                // Inicializa
                initializeFirebase(config);
            } else {
                alert("Arquivo JSON inválido. Não parece conter uma chave do Firebase.");
            }
        } catch (error) {
            console.error("Erro ao carregar o arquivo da chave:", error);
            alert("Arquivo de chave inválido ou corrompido.");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Limpa o input para poder carregar o mesmo arquivo de novo
}


// --- FUNÇÃO 3: SALVAR DADOS DO FORMULÁRIO E CONECTAR ---
function saveAndConnectFirebase() {
    const apiKey = document.getElementById('fb-apiKey').value.trim();
    const authDomain = document.getElementById('fb-authDomain').value.trim();
    const projectId = document.getElementById('fb-projectId').value.trim();
    const storageBucket = document.getElementById('fb-storageBucket').value.trim();
    const messagingSenderId = document.getElementById('fb-messagingSenderId').value.trim();
    const appId = document.getElementById('fb-appId').value.trim();

    if (!apiKey || !projectId) {
        alert("Pelo menos API Key e Project ID são obrigatórios.");
        return;
    }

    const config = {
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId,
        appId
    };

    // Salva no navegador
    localStorage.setItem('rpg_firebase_config', JSON.stringify(config));
    
    // Fecha modal
    document.getElementById('firebase-config-modal').style.display = 'none';
    
    // Inicializa
    initializeFirebase(config);
}

// --- FUNÇÃO 4: LIMPAR DADOS (Logout do sistema) ---
function clearFirebaseConfig() {
    if(confirm("Deseja desconectar e apagar as configurações salvas deste navegador?")) {
        localStorage.removeItem('rpg_firebase_config');
        location.reload(); // Recarrega a página para resetar
    }
}

// --- FUNÇÃO 5: INICIALIZAÇÃO REAL DO FIREBASE ---
function initializeFirebase(config) {
    if (firebase.apps.length === 0) {
        firebase.initializeApp(config);
    } else {
        // Se já existe app (caso raro de re-init), usa o existente ou deleta
        firebase.app(); 
    }

    db = firebase.firestore();
    
    // Configura as coleções globais agora que o DB existe
    messagesCollection = db.collection('chat_messages');
    playersCollection = db.collection('players');
    mapCollection = db.collection('maps').doc('main_map');
    bulletinBoardCollection = db.collection('bulletin_board_messages');
    bulletinStateRef = db.collection('game_state').doc('bulletin_board');
    
    appInitialized = true;
    console.log("Firebase conectado com sucesso!");

    // --- AQUI INICIAMOS OS LISTENERS QUE DEPENDEM DO FIREBASE ---
    // Chama as funções que antes rodavam soltas no load
    listenForMapChanges();
    listenForBulletinState();
    listenForBulletinMessages();
    listenForMessages();
    startPresenceSystem(); // Se já tiver nome na ficha, ele começa a sincronizar
}

        // --- DATA ---
        const allConditions = {
            'protegido': { name: 'Protegido (x)', type: 'bonus', description: 'Reduz o dano ao Vigor causado por danos que recebe em um valor igual a X. Quando conferido por uma ação básica ou situação narrativa o valor é igual a 1' },
            'vantagem': { name: 'Vantagem', type: 'bonus', description: 'Pode ser gasto para realizar uma ação extra quando escolher uma abordagem ou receber +2 em um teste.' },
            'inspirado': { name: 'Inspirado', type: 'bonus', description: '+1 em testes de atributo Criatividade. Pode ser gasto para remover ou evitar um ônus mental ou ganhar 1 de Vigor temporário que pode ser gasto apenas para habilidades ou semelhantes.', effects: [{ attr: 'criatividade', mod: 1 }] },
            'focado': { name: 'Focado', type: 'bonus', description: '+1 em testes de atributo de Discernimento. Pode ser gasto para rerolar um teste de atributo. Você pode fazer essa escolha após saber o resultado da rolagem.', effects: [{ attr: 'discernimento', mod: 1 }] },
            'fortalecido': { name: 'Fortalecido', type: 'bonus', description: '+1 em testes de atributo Força e Fortitude. Pode ser gasto para rerolar um teste de Força ou Fortitude. Você pode fazer essa escolha após saber o resultado da rolagem. Enquanto estiver em uma Cena Confronto causa +1 de Dano', effects: [{ attr: 'forca', mod: 1 }, { attr: 'fortitude', mod: 1 }] },
            'impetuoso': { name: 'Impetuoso', type: 'bonus', description: 'Pode ser gasto para realizar um turno extra.' },
            'agilizado': { name: 'Agilizado', type: 'bonus', description: '+1 em testes de atributo Destreza e o Deslocamento aumenta em 3 metros. Pode ser gasto para rerolar um teste de Destreza. Você pode fazer essa escolha após saber o resultado da rolagem.', effects: [{ attr: 'destreza', mod: 1 }] },
            'preparado': { name: 'Preparado', type: 'bonus', description: 'Pode ser gasto para evitar o próximo Ônus.' },
            'revitalizado': { name: 'Revitalizado', type: 'bonus', description: 'Recupera 1 de Vigor no início de seu turno e no turno que adquire o Bônus.' },
            'motivado': { name: 'Motivado', type: 'bonus', description: 'Recebe +1 em testes de atributo Vontade. Pode ser gasto para remover ou evitar um ônus mental, para remover um nível de Estresse ou recuperar 1 de Vigor.', effects: [{ attr: 'vontade', mod: 1 }] },
            'destemido': { name: 'Destemido', type: 'bonus', description: 'Recebe +1 em testes para determinar a ordem de conflito. Pode ser gasto para evitar a Condição Apavorado ou o Ônus assustado.' },
            'vulneravel': { name: 'Vulnerável (x)', type: 'onus', description: 'Aumenta o dano ao Vigor recebido em um valor igual a X. Quando conferido por uma ação básica ou situação narrativa o valor é igual a 1' },
            'desmotivado': { name: 'Desmotivado', type: 'onus', description: 'Recebe -2 em testes de atributo Vontade. Não pode recuperar Vigor', effects: [{ attr: 'vontade', mod: -2 }] },
            'enfraquecido': { name: 'Enfraquecido', type: 'onus', description: 'Recebe -1 em testes de atributo Força. Sempre que tentar infligir dano ao Vigor de algum alvo, causa -1 de dano (mínimo de 0)', effects: [{ attr: 'forca', mod: -1 }] },
            'lento': { name: 'Lento', type: 'onus', description: 'Não pode se beneficiar de turnos extras. Deslocamento diminui em 3 metros.' },
            'desvantagem': { name: 'Desvantagem', type: 'onus', description: 'Não pode realizar mais de uma ação por turno nem usar ações especiais. Recebe -2 no próximo teste.' },
            'em-apuros': { name: 'Em apuros', type: 'onus', description: 'Recebe 1 de dano ao Vigor no início do seu turno.' },
            'preso': { name: 'Preso', type: 'onus', description: '-2 em testes de atributo Destreza. Deslocamento passa a ser 0', effects: [{ attr: 'destreza', mod: -2 }] },
            'cansado': { name: 'Cansado', type: 'onus', description: 'Recebe -1 em todos os teste de atributo e o seu Deslocamento cai pela metade. Só pode ser removido em um descanso curto ou superior.', effects: [ { attr: 'destreza', mod: -1 }, { attr: 'forca', mod: -1 }, { attr: 'fortitude', mod: -1 }, { attr: 'discernimento', mod: -1 }, { attr: 'criatividade', mod: -1 }, { attr: 'vontade', mod: -1 } ] },
            'desorientado': { name: 'Desorientado', type: 'onus', description: 'Recebe -1 em testes de atributo Discernimento. Ganha um nível de Estresse.', effects: [{ attr: 'discernimento', mod: -1 }] },
            'assustado': { name: 'Assustado', type: 'onus', description: 'Recebe -2 em testes de atributo Criatividade e não pode realizar ações contra fonte do medo. Ao fim de um dos seus turnos sob esse Ônus, pode receber um nível de Estresse para encerrá-lo.', effects: [{ attr: 'criatividade', mod: -2 }] },
            'ferido': { name: 'Ferido', type: 'onus', description: 'Recebe -2 em testes de atributo Fortitude Se estiver sem Vigor fica Enfraquecido também. É removido ao final de um descanso longo.', effects: [{ attr: 'fortitude', mod: -2 }] },
            'baixa-visibilidade': { name: 'Baixa Visibilidade', type: 'onus', description: 'Deve pagar 1 de Vigor para realizar ações que dependem de visão e recebe -2 em testes de atributo que dependem da mesma.' },
            
            'apavorado': { name: 'Apavorado', type: 'condition', summary: 'Está Assustado, Desorientado e Preso.', description: 'Está Assustado, Desorientado e Preso até que seja removida a condição. Essa condição só pode ser removida quando a origem do medo é confrontada. Uma criatura pode realizar um teste de Vontade ao custode receber 1 nível de Estresse, em um sucesso completo a condição é removida.', linked: ['assustado', 'desorientado', 'preso'] },
            'gravemente-ferido': { name: 'Gravemente Ferido', type: 'condition', summary: 'Está Ferido, Em apuros, Cansado e com risco de morte.', description: 'Está Ferido, Em apuros, Cansado. Se seu Vigor chegar a 0 enquanto você estiver Gravemente Ferido você fica Incapacitado e deve realizar um teste de atributo de Vontade ou Fortitude, em um sucesso moderado você sobrevive uma rodada, em um sucesso completo você sobrevive um numero de rodadas igual ao valor do atributo utilizado no teste (minimo de 1). Caso contrário você morre. Gravemente ferido pode ser removido através de primeiros socorros ou outra solução adequada. Nesse caso é necessário realizar um Teste de Risco como uma ação. Em um sucesso moderado ou completo o participante Gravemente Ferido remove a Condição e o Ônus Em apuros, mas continua com os Ônus Ferido e Cansado, esses só podem ser removidos após um arco de descanso. Além disso ele continua Incapacitado até terminar um descanso curto caso esteja sem vigor.', linked: ['ferido', 'em-apuros', 'cansado', 'incapacitado'] },
            'exausto': { name: 'Exausto', type: 'condition', summary: 'Está Cansado, Enfraquecido, Lento e com Desvantagem.', description: 'Fica com os Ônus Cansado, Enfraquecido, Lento e Desvantagem. Só pode ser removido após um Arco de Descanso.', linked: ['cansado', 'enfraquecido', 'lento', 'desvantagem'] },
            'incapacitado': { name: 'Incapacitado', type: 'condition', summary: 'Não pode realizar ações, falar ou se mover.', description: 'Um participante incapacitado não pode realizar ações, falar, falha automaticamente em testes (exceto em caso do teste de risco da condição Gravemente ferido), se movimentar ou usar truques, a menos que uma habilidade diga o contrário. Um personagem é considerado Incapacitado quando inconsciente.  Uma criatura incapacitada por meios comuns, como por um desmaio de exaustão, que não esteja Gravemente Ferida, se recupera após um Descanso curto ou uma situação narrativa adequada.' },
            'cego': { name: 'Cego', type: 'condition', summary: 'Não pode enxergar e está Desorientado.', description: 'Um participante Cego não pode realizar ações que dependem de visão e falha automaticamente em testes que dependem da mesma. Está Desorientado até terminar a Condição.', linked: ['desorientado'] },
            'impedido': { name: 'Impedido', type: 'condition', summary: 'Está Preso, Enfraquecido e Lento. Não pode usar ações.', description: 'Um participante com a condição impedido recebe os ônus Preso, Enfraquecido e Lento. Enquanto Impedido não é possível usar ações. Um participante Impedido pode pagar 3 de Vigor para remover a condição.', linked: ['preso', 'enfraquecido', 'lento'] },
            'epifania': { name: 'Epifania', type: 'condition', summary: 'Recebe múltiplos bônus por uma cena.', description: 'Um participante que com a condição Epifania recebe os bônus Vantagem, Inspirado, Motivado, Impetuoso, Destemido e Focado. Epifania é uma recompensa narrativa por alguma situação adequada ou como recompensa por algum feito significativo pelo participante. Só pode ser conferida a jogadores e deve ser usada poucas vezes em momentos importantes. Epifania dura apenas uma cena. Só podendo ocorrer uma vez por sessão, no mínimo.', linked: ['vantagem', 'inspirado', 'motivado', 'impetuoso', 'destemido', 'focado'] },
        };
        const allActions = {
            title: "AÇÕES BÁSICAS",
            items: [
                { name: 'PREPARAR', description: 'Pague 1 de Vigor para preparar você ou seu ambiente, recebendo um Bônus ou se livrando de um Ônus ficcionalmente apropriado.' },
                { name: 'CONTRA-ATACAR', description: 'Prepare-se para usar a ofensiva do seu oponente. Até o início do seu próximo turno, sempre quando um oponente infligir um Ônus, dano ao seu Vigor ou remover um Bônus, inflija 1 de Vigor a ele.' },
                { name: 'POSICIONAR-SE', description: 'Mova-se para uma nova posição. Qualquer oponente engajado pode pagar 1 de Vigor para negar essa ação.' },
                { name: 'PROTEGER', description: 'Você defende um aliado. Ele recebe o Bônus Protegido (1). Você pode escolher ser o alvo de tentativas de dano/ônus contra ele.' },
                { name: 'FORÇAR MOVIMENTO', description: 'Pague 1 de Vigor para mover um oponente. Essa ação pode infligir um ônus. Ele pode pagar 1 de Vigor para negar.' },
                { name: 'ATACAR', description: 'Atinja um oponente, infligindo 2 de Vigor. Pode marcar 1 de Vigor para forçá-lo a escolher entre marcar 3 de Vigor ou um Ônus físico.' },
                { name: 'PRESSIONAR', description: 'Provoque ou intimide seu oponente. Escolha uma abordagem, seu oponente não pode escolher essa abordagem no próximo turno dele.' },
                { name: 'QUEBRAR', description: 'Marque 1 de Vigor para destruir ou desestabilizar algo no terreno, possivelmente infligindo ou superando um Bônus ou Ônus.' },
                { name: 'DEBILITAR', description: 'Marque 2 de Vigor para infligir um Ônus físico à sua escolha. Se o alvo estiver Ferido, pode ficar Gravemente ferido.' },
                { name: 'ESCONDER-SE', description: 'Marque 1 de Vigor para enganar os sentidos de um inimigo e receber Vantagem contra ele.' },
                { name: 'APOIAR', description: 'Ajude um aliado próximo a remover um Ônus mental, ou pague 1 Vigor para remover um Ônus físico.' },
                { name: 'FORTALECER / PREJUDICAR', description: 'Ajudar ou dificultar um personagem próximo, infligindo um Bônus ou Ônus apropriado a ele. Um oponente pode pagar 1 de Vigor no final de seu próximo turno para terminar o Ônus.' },
                { name: 'CONVERSAR', description: 'Use palavras para aplicar um Ônus mental. Requer um teste de atributo mental.' },
                { name: 'ENGANAR', description: 'Use truques para ganhar Vantagem ou infligir Desvantagem. Requer um teste de atributo.' },
            ]
        };
        
        // --- GLOBAL STATE ---
        let itemCardId = 0;
        let spellId = 0;
        let resourceId = 0;
        let abilityId = 0;
        let cropper;
        let currentCropperTarget = null;
        let quill;
        let galleryData = [];
        let stickersData = [];
        let currentBgImage = '';
        let isChatOpen = false;
        let isBulletinBoardOpen = false;
        let audioCtx;
        let lastMessageTimestamp = null;
        let lastBulletinTimestamp = null;
        let attributeModifiers = {};
        let attributeConditions = {};
        const attributeIds = ['destreza', 'forca', 'fortitude', 'discernimento', 'criatividade', 'vontade'];
        let presenceInterval;
        let unsubscribePlayerListener = null;
        let unsubscribeMapListener = null;
        let draggedToken = null;
        let highestZIndex = 151;
        let contextMenuStickerId = null;
        let lastPingTimestamp = 0; // NOVO

        // --- FUNÇÕES DE GERENCIAMENTO DE JANELAS ---
        function bringToFront(element) {
            highestZIndex++;
            element.style.zIndex = highestZIndex;
        }

        // --- FUNÇÕES DO MAPA DE CONFRONTO ---
        function openMap() {
            const mapModal = document.getElementById('map-modal');
            mapModal.style.display = 'flex';
            bringToFront(mapModal);
        }

        function closeMap() {
            document.getElementById('map-modal').style.display = 'none';
        }
        
        // --- NOVO: Função para renderizar o Ping vindo do Firebase ---
        function renderPing(x, y) {
            const mapTokensContainer = document.getElementById('map-tokens');
            if (!mapTokensContainer) return; // Segurança

            // Cria o elemento visual do ping
            const pingEl = document.createElement('div');
            pingEl.className = 'map-ping-target'; // O CSS DEVE EXISTIR NO fp.html
            pingEl.style.left = `${x}px`;
            pingEl.style.top = `${y}px`;

            // Adiciona ao container de tokens
            mapTokensContainer.appendChild(pingEl);

            // Remove após 8 segundos
            setTimeout(() => {
                pingEl.remove();
            }, 8000);
        }

        function updateTokenPosition(playerName, x, y) {
            const charName = document.getElementById('char-name').value.trim();
            if (playerName !== charName) return;
            
            mapCollection.update({
                [`tokens.${playerName}.x`]: x,
                [`tokens.${playerName}.y`]: y
            });
        }

        function listenForMapChanges() {
            if (unsubscribeMapListener) unsubscribeMapListener();

            unsubscribeMapListener = mapCollection.onSnapshot(doc => {
                const mapContainer = document.getElementById('map-container');
                const tokensContainer = document.getElementById('map-tokens');
                
                if (!doc.exists) {
                     mapContainer.style.backgroundImage = 'none';
                     tokensContainer.innerHTML = '';
                     return;
                }

                const mapData = doc.data();
                
                const mapWidth = mapData.width || 1000;
                const mapHeight = mapData.height || 1000;
                mapContainer.style.width = `${mapWidth}px`;
                mapContainer.style.height = `${mapHeight}px`;

                if (mapData.background && mapData.background.src) {
                    mapContainer.style.backgroundImage = `url('${mapData.background.src}')`;
                } else {
                    mapContainer.style.backgroundImage = 'none';
                }

                // --- NOVO: Lógica do Ping ---
                if (mapData.ping && mapData.ping.timestamp) {
                    // Tenta converter toMillis(), se falhar (ex: é um ServerTimestamp local), usa Date.now()
                    const serverTimestamp = mapData.ping.timestamp.toMillis ? mapData.ping.timestamp.toMillis() : Date.now();
                    if (serverTimestamp > (lastPingTimestamp || 0)) {
                        lastPingTimestamp = serverTimestamp;
                        renderPing(mapData.ping.x, mapData.ping.y);
                    }
                }
                // --- Fim da Lógica do Ping ---

                tokensContainer.innerHTML = '';
                const tokens = mapData.tokens || {};
                const localCharName = document.getElementById('char-name').value.trim();

                for (const playerName in tokens) {
                    const tokenData = tokens[playerName];
                    const tokenEl = document.createElement('div');
                    const tokenSizeInUnits = tokenData.size || 1;
                    const tokenPixelSize = tokenSizeInUnits * 50;

                    tokenEl.id = `token-${playerName}`;
                    tokenEl.className = 'player-token';
                    tokenEl.style.left = `${tokenData.x}px`;
                    tokenEl.style.top = `${tokenData.y}px`;
                    tokenEl.style.width = `${tokenPixelSize}px`;
                    tokenEl.style.height = `${tokenPixelSize}px`;
                    tokenEl.style.backgroundImage = `url('${tokenData.avatar || 'https://placehold.co/50x50/0f223d/ccd6f6?text=?'}')`;
                    tokenEl.dataset.name = playerName;
                    tokensContainer.appendChild(tokenEl);

                    if (playerName === localCharName) {
                        makeTokenDraggable(tokenEl, mapWidth, mapHeight, tokenPixelSize);
                    }
                }
            });
        }
        
        function makeTokenDraggable(tokenEl, mapWidth, mapHeight, tokenPixelSize) {
            let offsetX, offsetY;
            const gridSize = 50;

            const move = (e) => {
                e.preventDefault();
                if (!draggedToken) return;
                
                const viewport = document.getElementById('map-viewport');
                const rect = viewport.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                
                let x = clientX - rect.left + viewport.scrollLeft - offsetX;
                let y = clientY - rect.top + viewport.scrollTop - offsetY;

                x = Math.max(0, Math.min(mapWidth - tokenPixelSize, x));
                y = Math.max(0, Math.min(mapHeight - tokenPixelSize, y));
                
                draggedToken.style.left = `${x}px`;
                draggedToken.style.top = `${y}px`;
            };

            const startDrag = (e) => {
                e.preventDefault();
                if (e.button === 2) return;

                draggedToken = tokenEl;
                
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                const rect = draggedToken.getBoundingClientRect();
                offsetX = clientX - rect.left;
                offsetY = clientY - rect.top;
                
                window.addEventListener('mousemove', move);
                window.addEventListener('touchmove', move);
                window.addEventListener('mouseup', endDrag);
                window.addEventListener('touchend', endDrag);
            };

            const endDrag = () => {
                if (!draggedToken) return;
                
                let x = Math.round(draggedToken.offsetLeft / gridSize) * gridSize;
                let y = Math.round(draggedToken.offsetTop / gridSize) * gridSize;
                
                x = Math.max(0, Math.min(mapWidth - tokenPixelSize, x));
                y = Math.max(0, Math.min(mapHeight - tokenPixelSize, y));

                draggedToken.style.left = `${x}px`;
                draggedToken.style.top = `${y}px`;
                
                updateTokenPosition(draggedToken.dataset.name, x, y);

                draggedToken = null;
                window.removeEventListener('mousemove', move);
                window.removeEventListener('touchmove', move);
                window.removeEventListener('mouseup', endDrag);
                window.removeEventListener('touchend', endDrag);
            };

            tokenEl.addEventListener('mousedown', startDrag);
            tokenEl.addEventListener('touchstart', startDrag);
        }

        // --- FUNÇÕES DO QUADRO DE AVISOS ---
        function playBulletinSound() {
            if (!audioCtx) {
                try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) { console.error("Web Audio API is not supported in this browser"); return; }
            }
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.02);
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.2);
            oscillator.start(audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.4);
            oscillator.stop(audioCtx.currentTime + 0.4);
        }

        function toggleBulletinBoard() {
            const windowEl = document.getElementById('bulletin-board-window');
            isBulletinBoardOpen = !isBulletinBoardOpen;
            if (isBulletinBoardOpen) {
                windowEl.classList.remove('hidden');
                document.getElementById('bulletin-notification-dot').style.display = 'none';
                bringToFront(windowEl);
            } else {
                windowEl.classList.add('hidden');
            }
        }

        function listenForBulletinState() {
            bulletinStateRef.onSnapshot(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.last_shown) {
                        const serverTimestamp = data.last_shown.toMillis();
                        if (serverTimestamp > (lastBulletinTimestamp || 0)) {
                            lastBulletinTimestamp = serverTimestamp;
                            if (!isBulletinBoardOpen) {
                                document.getElementById('bulletin-notification-dot').style.display = 'block';
                            }
                            playBulletinSound();
                        }
                    }
                }
            });
        }

        function listenForBulletinMessages() {
            const messagesContainer = document.getElementById('bulletin-board-messages');
            
            bulletinBoardCollection.orderBy('timestamp', 'desc').onSnapshot(snapshot => {
                messagesContainer.innerHTML = ''; 
                if (snapshot.empty) {
                    messagesContainer.innerHTML = `<p class="text-center p-8" style="color: var(--color-text-secondary);">O quadro de avisos está vazio.</p>`;
                    return;
                }
                snapshot.forEach(doc => {
                    const msg = doc.data();
                    const msgElement = document.createElement('div');
                    const date = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleString('pt-BR') : 'Enviando...';

                    if (msg.type === 'attribute_test') {
                        msgElement.className = 'bulletin-message bulletin-message-test';
                        msgElement.dataset.attribute = msg.attribute;
                        msgElement.onclick = handleTestRequestClick;
                        msgElement.innerHTML = `
                            <div class="flex items-center gap-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-dice-5-fill flex-shrink-0" viewBox="0 0 16 16" style="color: var(--color-accent);">
                                    <path d="M3.5 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM9.5 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3.5 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm6-5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"></path>
                                </svg>
                                <div>
                                    <p class="font-bold">Mestre solicita um teste de atributo!</p>
                                    <p style="color: var(--color-accent);">${msg.attribute.toUpperCase()}</p>
                                </div>
                            </div>
                            <span class="timestamp">${date}</span>
                        `;
                    } else {
                        // Mensagem normal (lógica de combate removida)
                        msgElement.className = 'bulletin-message';
                        let contentHTML = '';
                        if (msg.text) {
                            contentHTML += `<p>${msg.text.replace(/\n/g, '<br>')}</p>`;
                        }
                        if (msg.imageUrl) {
                            contentHTML += `<img src="${msg.imageUrl}" alt="Aviso" onclick="openLightbox('${msg.imageUrl}')">`;
                        }
                        contentHTML += `<span class="timestamp">${date}</span>`;
                        msgElement.innerHTML = contentHTML;
                    }

                    messagesContainer.appendChild(msgElement);
                });
            }, error => {
                console.error("Erro ao ouvir avisos: ", error);
            });
        }

        function handleTestRequestClick(event) {
            const attributeName = event.currentTarget.dataset.attribute;
            if (!attributeName) return;

            const attributeId = attributeName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const attributeInput = document.getElementById(attributeId);
            
            if (attributeInput) {
                const attributeValue = parseInt(attributeInput.value) || 0;
                openRollModal(attributeId, attributeName, attributeValue);
            }
        }

        // --- FUNÇÕES DO CHAT E NOTIFICAÇÕES ---
        function playNotificationSound() {
            if (!audioCtx) {
                try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) {
                    console.error("Web Audio API is not supported in this browser");
                    return;
                }
            }
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
            
            oscillator.start(audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
            oscillator.stop(audioCtx.currentTime + 0.1);
        }

        function toggleChat() {
            const chatWindow = document.getElementById('chat-window');
            const notificationDot = document.getElementById('chat-notification-dot');
            
            isChatOpen = !isChatOpen;
            chatWindow.classList.toggle('hidden');

            if (isChatOpen) {
                notificationDot.style.display = 'none';
                bringToFront(chatWindow);
            }
        }

        async function sendMessage(messageData) {
            const text = messageData.text.trim();
            if (text === '') return;

            const charName = document.getElementById('char-name').value.trim() || 'Anônimo';
            const avatar = document.getElementById('image-preview').src || '';

            try {
                await messagesCollection.add({
                    text: text,
                    sender: charName,
                    avatar: avatar,
                    isSystem: messageData.isSystem || false,
                    isPrivate: messageData.isPrivate || false,
                    recipient: messageData.recipient || null,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                if (!messageData.isSystem) {
                    document.getElementById('chat-input').value = '';
                }
            } catch (error) {
                console.error("Erro ao enviar mensagem: ", error);
                alert("Não foi possível enviar a mensagem.");
            }
        }

        function listenForMessages() {
            const messagesContainer = document.getElementById('chat-messages');
            const listenerTimestamp = new Date();

            messagesCollection.orderBy('timestamp', 'asc').where('timestamp', '>=', listenerTimestamp).onSnapshot(snapshot => {
                const charName = document.getElementById('char-name').value.trim() || 'Anônimo';
                
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const msg = change.doc.data();
                        if (!msg.text) return;

                        if (msg.sender !== charName && !isChatOpen) {
                            if (!msg.isPrivate || (msg.isPrivate && msg.recipient === charName)) {
                                document.getElementById('chat-notification-dot').style.display = 'block';
                                playNotificationSound();
                            }
                        }
                        
                        const msgElement = document.createElement('div');
                        let shouldDisplay = false;

                        if (msg.isSystem) {
                            shouldDisplay = true;
                            msgElement.className = 'chat-message-system';
                            msgElement.innerHTML = `<span>${msg.text}</span>`;
                        } else if (msg.isPrivate) {
                            if (msg.recipient === charName || msg.sender === charName) {
                                shouldDisplay = true;
                                msgElement.className = `chat-message ${msg.sender === charName ? 'chat-message-own' : 'chat-message-other'} chat-message-private`;
                                let senderText = (msg.sender === charName) ? `Sussurro para ${msg.recipient}` : `Sussurro de ${msg.sender}`;
                                msgElement.innerHTML = `
                                    <img src="${msg.avatar || 'https://placehold.co/40x40/0f223d/ccd6f6?text=?'}" class="chat-avatar" alt="Avatar">
                                    <div class="chat-message-content">
                                        <span class="sender">${senderText}</span>
                                        <span>${msg.text}</span>
                                    </div>`;
                            }
                        } else { 
                            shouldDisplay = true;
                            msgElement.className = `chat-message ${msg.sender === charName ? 'chat-message-own' : 'chat-message-other'}`;
                            msgElement.innerHTML = `
                                <img src="${msg.avatar || 'https://placehold.co/40x40/0f223d/ccd6f6?text=?'}" class="chat-avatar" alt="Avatar">
                                <div class="chat-message-content">
                                    <span class="sender">${msg.sender}</span>
                                    <span>${msg.text}</span>
                                </div>`;
                        }

                        if (shouldDisplay) {
                            messagesContainer.appendChild(msgElement);
                        }
                    }
                });
                
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, error => {
                console.error("Erro ao ouvir mensagens: ", error);
            });
        }

        // --- FUNÇÕES DE ROLAGEM DE DADOS ---
        function rollDice(sides, count = 1) {
            let total = 0;
            for (let i = 0; i < count; i++) {
                total += Math.floor(Math.random() * sides) + 1;
            }
            return total;
        }

        function handleAttributeRoll(type, attrId, attrName, attrValue) {
            let rollResult;
            let rollDetails;
            if (type === 'normal') {
                rollResult = rollDice(12);
                rollDetails = `1d12`;
            } else { 
                rollResult = rollDice(6, 2);
                rollDetails = `2d6`;
            }

            const modifier = attributeModifiers[attrId] || 0;
            const total = rollResult + attrValue + modifier;
            const charName = document.getElementById('char-name').value.trim() || 'Anônimo';
            
            let conditionsText = "";
            if (attributeConditions[attrId] && attributeConditions[attrId].length > 0) {
                conditionsText = ` - "${attributeConditions[attrId].join(', ')}"`;
            }

            const message = `${charName} - Teste de ${attrName}: ${total} (${rollDetails} + ${attrValue}${modifier !== 0 ? (modifier > 0 ? ' + ' : ' ') + modifier : ''}${conditionsText})`;
            
            sendMessage({ text: message, isSystem: true });
            closeRollModal();
        }

        function handleCustomRoll(type) {
            const modifierInput = document.getElementById('custom-roll-modifier');
            const modifier = parseInt(modifierInput.value) || 0;
            
            let rollResult;
            let rollDetails;
            if (type === 'normal') {
                rollResult = rollDice(12);
                rollDetails = `1d12`;
            } else { 
                rollResult = rollDice(6, 2);
                rollDetails = `2d6`;
            }

            const total = rollResult + modifier;
            const charName = document.getElementById('char-name').value.trim() || 'Anônimo';
            const message = `${charName} - Rolagem Customizada: ${total} (${rollDetails}${modifier !== 0 ? (modifier > 0 ? ' + ' : ' ') + modifier : ''})`;

            sendMessage({ text: message, isSystem: true });
            closeCustomRollModal();
        }

        function openRollModal(attrId, attrName, attrValue) {
            const modal = document.getElementById('roll-test-modal');
            modal.style.display = 'flex';
            bringToFront(modal);

            document.getElementById('roll-modal-title').textContent = `Rolar Teste de ${attrName}?`;

            const newNormalBtn = document.getElementById('roll-normal-btn').cloneNode(true);
            document.getElementById('roll-normal-btn').parentNode.replaceChild(newNormalBtn, document.getElementById('roll-normal-btn'));
            newNormalBtn.addEventListener('click', () => handleAttributeRoll('normal', attrId, attrName, attrValue));

            const newAptidaoBtn = document.getElementById('roll-aptidao-btn').cloneNode(true);
            document.getElementById('roll-aptidao-btn').parentNode.replaceChild(newAptidaoBtn, document.getElementById('roll-aptidao-btn'));
            newAptidaoBtn.addEventListener('click', () => handleAttributeRoll('aptidao', attrId, attrName, attrValue));
        }

        function closeRollModal() {
            document.getElementById('roll-test-modal').style.display = 'none';
        }

        function openCustomRollModal() {
            const modal = document.getElementById('custom-roll-modal');
            modal.style.display = 'flex';
            bringToFront(modal);
        }

        function closeCustomRollModal() {
            document.getElementById('custom-roll-modal').style.display = 'none';
        }
        
        function setupAttributeRolls() {
            attributeIds.forEach(attr => {
                const label = document.getElementById(`label-${attr}`);
                label.addEventListener('click', () => {
                    const input = document.getElementById(attr);
                    const value = parseInt(input.value) || 0;
                    const name = label.textContent.trim().split(' ')[0];
                    openRollModal(attr, name, value);
                });
            });
        }

        // --- CORE FUNCTIONS ---
        function updateValue(id, amount, isResource = false, resourceId = null) {
            const input = document.getElementById(id);
            let currentValue = parseInt(input.value, 10);
            if (isNaN(currentValue)) currentValue = 0;
            
            let newValue = currentValue + amount;

            if (id.includes('vigor')) {
                const maxVigor = parseInt(document.getElementById('vigor-max').textContent, 10) || 0;
                if (newValue > maxVigor) newValue = maxVigor;
            } else if (isResource) {
                const maxEl = document.getElementById(`resource-total-${resourceId}`);
                const maxValue = parseInt(maxEl.value) || 0;
                if (newValue > maxValue) newValue = maxValue;
            }

            input.value = newValue < 0 ? 0 : newValue;
            
            if (id.includes('vigor')) {
                updateVigorBar();
                updatePresence();
            }
        }

        function switchMainTab(event, tabName) {
            document.querySelectorAll('.main-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.main-tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        function switchSubTab(event, tabName) {
            document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.sub-tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        function switchItemTab(event, tabName) {
            document.querySelectorAll('.item-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.item-tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        function switchAbilityTab(event, tabName) {
            document.querySelectorAll('.ability-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.ability-tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        function adjustIdeals(direction) {
            const counter1El = document.getElementById('ideal1-counter');
            const counter2El = document.getElementById('ideal2-counter');
            let value1 = parseInt(counter1El.textContent);
            let value2 = parseInt(counter2El.textContent);
            if (direction === -1) { value1 += 1; value2 -= 1; } 
            else if (direction === 1) { value1 -= 1; value2 += 1; }
            counter1El.textContent = value1;
            counter2El.textContent = value2;
        }

        function toggleDescription(headerElement) {
            const content = headerElement.nextElementSibling;
            const arrow = headerElement.querySelector('.arrow');
            content.classList.toggle('hidden');
            arrow.classList.toggle('rotate-90');
        }

        // --- DYNAMIC CONTENT FUNCTIONS ---
        function addWeapon(data = {}) {
            const weaponsList = document.getElementById('weapons-list');
            const newWeaponRow = document.createElement('div');
            newWeaponRow.className = 'grid grid-cols-12 gap-3 items-center bg-tertiary p-2 rounded-md clipped';
            newWeaponRow.innerHTML = `
                <input type="text" placeholder="Nome da Arma" class="col-span-12 md:col-span-3 p-2 rounded-md" value="${data.name || ''}">
                <input type="text" placeholder="Propriedades" class="col-span-12 md:col-span-3 p-2 rounded-md" value="${data.props || ''}">
                <input type="text" placeholder="Dano" class="col-span-12 md:col-span-1 p-2 rounded-md" value="${data.damage || ''}">
                <input type="text" placeholder="Efeito" class="col-span-12 md:col-span-4 p-2 rounded-md" value="${data.effect || ''}">
                <button onclick="this.parentElement.remove()" class="col-span-12 md:col-span-1 text-red-500 hover:text-red-400 text-center font-bold">X</button>
            `;
            weaponsList.appendChild(newWeaponRow);
        }

        function addSpell(data = {}) {
            spellId++;
            const container = document.getElementById('spells-container');
            const spellHTML = `
                <div class="bg-tertiary p-3 rounded-lg clipped" id="spell-${spellId}">
                    <div class="flex items-center justify-between">
                        <input type="text" placeholder="Nome da Magia" class="flex-grow p-2 rounded-md text-primary font-semibold" value="${data.name || ''}">
                        <div class="flex items-center ml-4">
                            <button onclick="document.getElementById('spell-desc-${spellId}').classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-180')" class="p-1 text-secondary hover:text-primary">
                                <svg class="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                            <button onclick="document.getElementById('spell-${spellId}').remove()" class="p-1 text-red-500 hover:text-red-400 ml-2">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                    </div>
                    <textarea id="spell-desc-${spellId}" class="w-full h-24 rounded-md p-2 mt-2" placeholder="Descreva a magia...">${data.desc || ''}</textarea>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', spellHTML);
        }

        function addItemCard(data = {}) {
            itemCardId++;
            const container = document.getElementById('item-cards-container');
            const card = document.createElement('div');
            card.className = 'bg-tertiary p-4 rounded-lg flex flex-col relative clipped';
            card.id = `item-card-${itemCardId}`;
            card.innerHTML = `
                <button onclick="this.parentElement.remove()" class="absolute top-1 right-1 text-secondary hover:text-primary bg-primary/50 rounded-full p-1 z-10">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <input type="text" placeholder="Nome do Item" class="w-full p-2 rounded-md mb-2" value="${data.name || ''}">
                <label id="item-card-label-${itemCardId}" for="item-card-upload-${itemCardId}" class="cursor-pointer mt-2 block h-32 rounded-md flex items-center justify-center text-secondary hover:bg-border transition-colors relative overflow-hidden bg-tertiary">
                    <img id="item-card-preview-${itemCardId}" src="" class="item-card-preview w-full h-full hidden">
                    <span id="item-card-placeholder-${itemCardId}">+ Adicionar Imagem</span>
                </label>
                <input type="file" id="item-card-upload-${itemCardId}" class="hidden" accept="image/*" onchange="handleItemCardImageUpload(event, ${itemCardId})">
            `;
            container.appendChild(card);

            if (data.img) {
                const preview = card.querySelector(`#item-card-preview-${itemCardId}`);
                const placeholder = card.querySelector(`#item-card-placeholder-${itemCardId}`);
                const label = card.querySelector(`#item-card-label-${itemCardId}`);
                preview.src = data.img;
                preview.classList.remove('hidden');
                placeholder.style.display = 'none';
                label.removeAttribute('for');
                label.onclick = (clickEvent) => {
                    clickEvent.preventDefault();
                    openLightbox(data.img);
                };
            }
        }
        
        function addResource(data = {}) {
            resourceId++;
            const container = document.getElementById('recursos-container');
            const card = document.createElement('div');
            card.className = 'resource-card';
            card.id = `resource-${resourceId}`;
            card.innerHTML = `
                <button onclick="this.parentElement.remove()" class="resource-delete-btn" title="Excluir Recurso">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <input type="text" placeholder="Nome do Recurso" class="w-full p-2 rounded-md mb-2 font-semibold" value="${data.name || ''}">
                <textarea class="w-full h-20 rounded-md p-2 mb-2" placeholder="Descrição...">${data.desc || ''}</textarea>
                <div class="resource-counter">
                    <button onclick="updateValue('resource-current-${resourceId}', -1, true, ${resourceId})" class="btn-minus font-bold w-8 h-8 rounded-full transition-colors flex-shrink-0">-</button>
                    <input type="number" id="resource-current-${resourceId}" value="${data.current || 0}" class="rounded-md p-1">
                    <span class="text-secondary">/</span>
                    <input type="number" id="resource-total-${resourceId}" value="${data.total || 0}" class="rounded-md p-1">
                    <button onclick="updateValue('resource-current-${resourceId}', 1, true, ${resourceId})" class="btn-plus font-bold w-8 h-8 rounded-full transition-colors flex-shrink-0">+</button>
                </div>
            `;
            container.appendChild(card);
        }

        function addExpandableItem(containerId, data = {}) {
            abilityId++;
            const container = document.getElementById(containerId);
            const card = document.createElement('div');
            card.className = 'expandable-item-card';
            card.id = `ability-${abilityId}`;

            card.innerHTML = `
                <div class="expandable-item-header" onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.arrow').classList.toggle('rotate-90')">
                    <input type="text" placeholder="Nome..." class="text-primary" value="${data.name || ''}">
                    <div class="expandable-item-controls">
                        <button class="arrow">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                        <button class="delete-btn" onclick="event.stopPropagation(); this.closest('.expandable-item-card').remove();">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>
                <div class="expandable-item-body hidden">
                    <textarea class="auto-resize rounded-md p-2" placeholder="Descrição..." oninput="autoResizeTextarea(this)">${data.desc || ''}</textarea>
                </div>
            `;
            container.appendChild(card);
            autoResizeTextarea(card.querySelector('textarea'));
        }

        // --- VIGOR & EFFECTS ---
        function updateMaxVigor() {
            const fortitudeInput = document.getElementById('fortitude');
            const vigorInput = document.getElementById('vigor');
            const vigorMaxDisplay = document.getElementById('vigor-max');
            
            const fortitudeValue = parseInt(fortitudeInput.value, 10) || 0;
            const newMaxVigor = 6 + fortitudeValue;

            vigorMaxDisplay.textContent = newMaxVigor;
            
            const currentVigor = parseInt(vigorInput.value, 10);
            if (isNaN(currentVigor) || currentVigor > newMaxVigor || vigorInput.value === "") {
                vigorInput.value = newMaxVigor;
            }
            updateVigorBar();
        }

        function updateVigorBar() {
            const vigorInput = document.getElementById('vigor');
            const maxVigorDisplay = document.getElementById('vigor-max');
            const barFill = document.getElementById('vigor-bar-fill');
            const barText = document.getElementById('vigor-text');

            const currentValue = parseInt(vigorInput.value, 10) || 0;
            const maxValue = parseInt(maxVigorDisplay.textContent, 10) || 1;

            const percentage = Math.max(0, Math.min(100, (currentValue / maxValue) * 100));
            const rootStyles = getComputedStyle(document.documentElement);

            barFill.style.width = `${percentage}%`;
            barText.textContent = `${currentValue} / ${maxValue}`;

            if (percentage > 50) {
                barFill.style.backgroundColor = rootStyles.getPropertyValue('--color-green');
            } else if (percentage > 25) {
                barFill.style.backgroundColor = rootStyles.getPropertyValue('--color-yellow');
            } else {
                barFill.style.backgroundColor = rootStyles.getPropertyValue('--color-red');
            }
        }

        function updateActiveEffects() {
            const activeBonusContainer = document.getElementById('active-bonus');
            const activeOnusContainer = document.getElementById('active-onus');
            const activeSpecialContainer = document.getElementById('active-special');
            
            activeBonusContainer.innerHTML = '';
            activeOnusContainer.innerHTML = '';
            activeSpecialContainer.innerHTML = '';

            attributeModifiers = {};
            attributeConditions = {};
            attributeIds.forEach(id => {
                attributeModifiers[id] = 0;
                attributeConditions[id] = [];
            });

            document.querySelectorAll('#conditions-container input:checked').forEach(checkbox => {
                const conditionData = allConditions[checkbox.id];
                if (conditionData) {
                    let container, colorClass, descriptionText;
                    switch (conditionData.type) {
                        case 'bonus': container = activeBonusContainer; colorClass = 'text-green-400'; descriptionText = conditionData.description; break;
                        case 'onus': container = activeOnusContainer; colorClass = 'text-red-400'; descriptionText = conditionData.description; break;
                        case 'condition': container = activeSpecialContainer; colorClass = 'text-yellow-400'; descriptionText = conditionData.summary; break;
                    }
                    container.innerHTML += `<div class="${colorClass} text-sm"><strong class="font-semibold">${conditionData.name}:</strong> <span>${descriptionText}</span></div>`;

                    if (conditionData.effects) {
                        conditionData.effects.forEach(effect => {
                            if (attributeModifiers.hasOwnProperty(effect.attr)) {
                                attributeModifiers[effect.attr] += effect.mod;
                                attributeConditions[effect.attr].push(conditionData.name);
                            }
                        });
                    }
                }
            });

            attributeIds.forEach(attr => {
                const indicator = document.getElementById(`${attr}-indicator`);
                if (indicator) {
                    if (attributeModifiers[attr] > 0) {
                        indicator.innerHTML = `<span class="text-green-400 font-bold">▲</span>`;
                    } else if (attributeModifiers[attr] < 0) {
                        indicator.innerHTML = `<span class="text-red-400 font-bold">▼</span>`;
                    } else {
                        indicator.innerHTML = '';
                    }
                }
            });
        }
        
        function handleConditionChange(checkbox) {
            const conditionId = checkbox.id;
            const isChecked = checkbox.checked;
            const conditionData = allConditions[conditionId];

            if (conditionData && conditionData.linked) {
                conditionData.linked.forEach(linkedId => {
                    const linkedCheckbox = document.getElementById(linkedId);
                    if (linkedCheckbox) {
                        linkedCheckbox.checked = isChecked;
                    }
                });
            }
            updateActiveEffects();
            updatePresence(); 
        }

        // --- IMAGE HANDLING & CROPPER ---
        function openCropper(event, targetId) {
            const files = event.target.files;
            if (files && files.length > 0) {
                currentCropperTarget = targetId;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const modal = document.getElementById('cropper-modal');
                    const imageToCrop = document.getElementById('image-to-crop');
                    imageToCrop.src = e.target.result;
                    modal.style.display = 'flex';
                    bringToFront(modal);
                    if (cropper) cropper.destroy();
                    cropper = new Cropper(imageToCrop, {
                        aspectRatio: 1,
                        viewMode: 1,
                        background: false,
                        autoCropArea: 0.8,
                        responsive: true
                    });
                };
                reader.readAsDataURL(files[0]);
            }
        }
        
        function confirmCrop() {
            if (!cropper || !currentCropperTarget) return;

            const canvas = cropper.getCroppedCanvas({ width: 256, height: 256 });
            const newImageSrc = canvas.toDataURL();
            
            if (currentCropperTarget === 'character') {
                document.getElementById('image-preview').src = newImageSrc;
                document.getElementById('image-placeholder').style.display = 'none';
                updatePresence();
            }
            
            closeCropper();
        }

        function closeCropper() {
            const modal = document.getElementById('cropper-modal');
            modal.style.display = 'none';
            if (cropper) cropper.destroy();
            cropper = null;
            currentCropperTarget = null;
            document.getElementById('image-upload').value = '';
        }

        function handleCombatImageUpload(event) {
            const input = event.target;
            const preview = document.getElementById('combat-image-preview');
            const placeholder = document.getElementById('combat-image-placeholder');

            if (input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                    placeholder.style.display = 'none';
                }
                reader.readAsDataURL(input.files[0]);
            }
        }

        function handleItemCardImageUpload(event, id) {
            const input = event.target;
            const preview = document.getElementById(`item-card-preview-${id}`);
            const placeholder = document.getElementById(`item-card-placeholder-${id}`);
            const label = document.getElementById(`item-card-label-${id}`);

            if (input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                    placeholder.style.display = 'none';
                    label.removeAttribute('for');
                    label.onclick = (clickEvent) => {
                        clickEvent.preventDefault();
                        openLightbox(e.target.result);
                    };
                }
                reader.readAsDataURL(input.files[0]);
            }
        }

        function openLightbox(imageUrl) {
            const lightbox = document.getElementById('gallery-lightbox');
            document.getElementById('lightbox-image').src = imageUrl;
            lightbox.style.display = 'flex';
            bringToFront(lightbox);
        }

        function closeLightbox(event) {
            if (event.target.id === 'gallery-lightbox' || event.target.tagName === 'BUTTON') {
                document.getElementById('gallery-lightbox').style.display = 'none';
            }
        }

        // --- THEME SWITCHER ---
        function applyTheme(themeName) {
            document.documentElement.setAttribute('data-theme', themeName);
            localStorage.setItem('characterSheetTheme', themeName);
            updateVigorBar();
        }

        // --- SAVE & LOAD ---
        function saveSheet() {
            const sheetData = {
                version: 'v36_player',
                theme: localStorage.getItem('characterSheetTheme') || 'onenari',
                charName: document.getElementById('char-name').value,
                image: document.getElementById('image-preview').src,
                combatImage: document.getElementById('combat-image-preview').src,
                attributes: {
                    destreza: document.getElementById('destreza').value,
                    forca: document.getElementById('forca').value,
                    fortitude: document.getElementById('fortitude').value,
                    discernimento: document.getElementById('discernimento').value,
                    criatividade: document.getElementById('criatividade').value,
                    vontade: document.getElementById('vontade').value,
                },
                vitals: {
                    vigor: document.getElementById('vigor').value,
                    estresse: document.getElementById('estresse').value,
                },
                ideals: {
                    ideal1: document.getElementById('ideal1-counter').textContent,
                    ideal2: document.getElementById('ideal2-counter').textContent,
                    ideal1_text: document.getElementById('ideal1-text').value,
                    ideal2_text: document.getElementById('ideal2-text').value,
                },
                abilities: {
                    archetype: [],
                    lineages: [],
                    tricks: []
                },
                textareas: {},
                spells: [],
                itemCards: [],
                weapons: [],
                resources: [],
                defenses: {},
                conditions: [],
                annotations: quill.root.innerHTML,
                gallery: galleryData,
                stickers: stickersData,
                background: currentBgImage,
            };

            document.querySelectorAll('#archetype-container .expandable-item-card').forEach(item => sheetData.abilities.archetype.push({name: item.querySelector('input').value, desc: item.querySelector('textarea').value}));
            document.querySelectorAll('#lineages-container .expandable-item-card').forEach(item => sheetData.abilities.lineages.push({name: item.querySelector('input').value, desc: item.querySelector('textarea').value}));
            document.querySelectorAll('#tricks-container .expandable-item-card').forEach(item => sheetData.abilities.tricks.push({name: item.querySelector('input').value, desc: item.querySelector('textarea').value}));

            sheetData.textareas['aptidoes'] = document.querySelector('#aptidoes-textarea').value;
            sheetData.textareas['itensMundanos'] = document.querySelector('#itens-mundanos-textarea').value;
            sheetData.textareas['itensEspeciais'] = document.getElementById('itens-especiais-textarea').value;
            
            document.querySelectorAll('#spells-container > div').forEach(spellDiv => {
                sheetData.spells.push({ name: spellDiv.querySelector('input').value, desc: spellDiv.querySelector('textarea').value });
            });
            document.querySelectorAll('#item-cards-container > div').forEach(cardDiv => {
                sheetData.itemCards.push({ name: cardDiv.querySelector('input').value, img: cardDiv.querySelector('img').src });
            });
            document.querySelectorAll('#recursos-container > div').forEach(resourceDiv => {
                sheetData.resources.push({
                    name: resourceDiv.querySelector('input[type=text]').value,
                    desc: resourceDiv.querySelector('textarea').value,
                    current: resourceDiv.querySelector('input[id^=resource-current]').value,
                    total: resourceDiv.querySelector('input[id^=resource-total]').value,
                });
            });
            document.querySelectorAll('#weapons-list > div:not(:first-child)').forEach(weaponRow => {
                const inputs = weaponRow.querySelectorAll('input');
                sheetData.weapons.push({ name: inputs[0].value, props: inputs[1].value, damage: inputs[2].value, effect: inputs[3].value });
            });
            sheetData.defenses.armorName = document.getElementById('armor-name').value;
            sheetData.defenses.armorValue = document.getElementById('armadura-value').value;
            sheetData.defenses.shieldValue = document.getElementById('escudo-value').value;
            document.querySelectorAll('#conditions-container input:checked').forEach(checkbox => {
                sheetData.conditions.push(checkbox.id);
            });

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sheetData, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            const fileName = sheetData.charName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'personagem';
            downloadAnchorNode.setAttribute("download", `${fileName}_ficha.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }

        function loadSheet(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    document.getElementById('weapons-list').querySelectorAll('div:not(:first-child)').forEach(el => el.remove());
                    document.getElementById('spells-container').innerHTML = '';
                    document.getElementById('item-cards-container').innerHTML = '';
                    document.getElementById('recursos-container').innerHTML = '';
                    document.getElementById('archetype-container').innerHTML = '';
                    document.getElementById('lineages-container').innerHTML = '';
                    document.getElementById('tricks-container').innerHTML = '';
                    
                    spellId = 0; itemCardId = 0; resourceId = 0; abilityId = 0;

                    applyTheme(data.theme || 'onenari');

                    document.getElementById('char-name').value = data.charName || '';
                    if (data.image && data.image.startsWith('data:image')) {
                        document.getElementById('image-preview').src = data.image;
                        document.getElementById('image-placeholder').style.display = 'none';
                    }
                    if (data.combatImage && data.combatImage.startsWith('data:image')) {
                        const combatPreview = document.getElementById('combat-image-preview');
                        const combatPlaceholder = document.getElementById('combat-image-placeholder');
                        if(combatPreview && combatPlaceholder){
                            combatPreview.src = data.combatImage;
                            combatPreview.classList.remove('hidden');
                            combatPlaceholder.style.display = 'none';
                        }
                    }
                    Object.keys(data.attributes).forEach(key => {
                        document.getElementById(key).value = data.attributes[key];
                    });
                    
                    Object.keys(data.vitals).forEach(key => {
                        document.getElementById(key).value = data.vitals[key];
                    });
                    
                    if (data.ideals) {
                        document.getElementById('ideal1-text').value = data.ideals.ideal1_text || '';
                        document.getElementById('ideal2-text').value = data.ideals.ideal2_text || '';
                        document.getElementById('ideal1-counter').textContent = data.ideals.ideal1 || '0';
                        document.getElementById('ideal2-counter').textContent = data.ideals.ideal2 || '0';
                    }

                    if(data.abilities) {
                        if(data.abilities.archetype) data.abilities.archetype.forEach(item => addExpandableItem('archetype-container', item));
                        if(data.abilities.lineages) data.abilities.lineages.forEach(item => addExpandableItem('lineages-container', item));
                        if(data.abilities.tricks) data.abilities.tricks.forEach(item => addExpandableItem('tricks-container', item));
                    }

                    document.querySelector('#aptidoes-textarea').value = data.textareas['aptidoes'] || '';
                    document.querySelector('#itens-mundanos-textarea').value = data.textareas['itensMundanos'] || '';
                    const itensEspeciaisTextarea = document.getElementById('itens-especiais-textarea');
                    itensEspeciaisTextarea.value = data.textareas['itensEspeciais'] || '';
                    autoResizeTextarea(itensEspeciaisTextarea);

                    if(data.spells) data.spells.forEach(spellData => addSpell(spellData));
                    if(data.itemCards) data.itemCards.forEach(cardData => addItemCard(cardData));
                    if(data.resources) data.resources.forEach(resourceData => addResource(resourceData));
                    if(data.weapons) data.weapons.forEach(weaponData => addWeapon(weaponData));

                    document.getElementById('armor-name').value = data.defenses.armorName || '';
                    document.getElementById('armadura-value').value = data.defenses.armorValue || '0';
                    document.getElementById('escudo-value').value = data.defenses.shieldValue || '0';

                    document.querySelectorAll('#conditions-container input').forEach(cb => cb.checked = false);
                    if(data.conditions) {
                        data.conditions.forEach(id => {
                            const checkbox = document.getElementById(id);
                            if (checkbox) checkbox.checked = true;
                        });
                    }
                    if (data.annotations) {
                        quill.root.innerHTML = data.annotations;
                    }
                    if (data.gallery) {
                        galleryData = data.gallery;
                        renderGallery();
                    }
                    if (data.stickers) {
                        stickersData = data.stickers;
                        renderStickers();
                    }
                    if (data.background) {
                        setBodyBackground(data.background);
                    }
                    
                    updateMaxVigor();
                    updateVigorBar();
                    updateActiveEffects();
                    
                    startPresenceSystem();

                } catch (error) {
                    console.error("Erro ao carregar o arquivo da ficha:", error);
                    alert("Arquivo de ficha inválido ou corrompido.");
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }
        
        function autoResizeTextarea(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
        }

        function switchGalleryTab(event, tabName) {
            document.querySelectorAll('.gallery-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.gallery-tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        function openGallery(isForMap = false) { 
            const modal = document.getElementById('gallery-modal');
            modal.dataset.isForMap = isForMap;
            modal.style.display = 'flex';
            bringToFront(modal);
        }
        function closeGallery() { document.getElementById('gallery-modal').style.display = 'none'; }
        function closeUrlModal() { document.getElementById('gallery-url-modal').style.display = 'none'; }
        
        function handleGalleryUrlAdd() {
            document.getElementById('gallery-url-input').value = '';
            const modal = document.getElementById('gallery-url-modal');
            modal.style.display = 'flex';
            bringToFront(modal);
        }

        function submitUrlModal() {
            const url = document.getElementById('gallery-url-input').value;
            if (url) {
                addImageToGallery({ src: url, caption: 'Imagem da Web' });
            }
            closeUrlModal();
        }

        function handleGalleryUpload(event) {
            const files = event.target.files;
            for (const file of files) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    addImageToGallery({ src: e.target.result, caption: file.name.split('.').slice(0, -1).join('.') });
                };
                reader.readAsDataURL(file);
            }
            event.target.value = '';
        }

        function addImageToGallery(imageData) {
            const newImage = {
                id: `gallery-img-${Date.now()}-${Math.random()}`,
                src: imageData.src,
                caption: imageData.caption || '',
            };
            galleryData.push(newImage);
            renderGallery();
        }

        function renderGallery() {
            const galleryContent = document.getElementById('gallery-content');
            galleryContent.innerHTML = '';
            galleryData.forEach(imgData => {
                const thumb = document.createElement('div');
                thumb.className = 'gallery-thumbnail clipped';
                thumb.id = imgData.id;
                
                const menuButtonAction = `<button onclick="setBodyBackground('${imgData.src}')">Usar como Fundo</button>`;

                thumb.innerHTML = `
                    <img src="${imgData.src}" alt="${imgData.caption}" onclick="openLightbox('${imgData.src}')">
                    <input type="text" class="gallery-thumbnail-caption" value="${imgData.caption}" onchange="updateGalleryCaption('${imgData.id}', this.value)" placeholder="Legenda...">
                    <div class="gallery-thumbnail-menu">
                        <button class="gallery-thumbnail-menu-btn">
                            <svg class="w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                        </button>
                        <div class="gallery-thumbnail-menu-content">
                            ${menuButtonAction}
                            <button onclick="removeImageFromGallery('${imgData.id}')">Remover</button>
                            <button onclick="downloadImage('${imgData.src}', '${imgData.caption}')">Baixar</button>
                        </div>
                    </div>
                `;
                galleryContent.appendChild(thumb);
            });
        }
        
        function updateGalleryCaption(id, newCaption) {
            const image = galleryData.find(img => img.id === id);
            if (image) {
                image.caption = newCaption;
            }
        }

        function removeImageFromGallery(id) {
            galleryData = galleryData.filter(img => img.id !== id);
            renderGallery();
        }

        function downloadImage(src, name) {
            const a = document.createElement('a');
            a.href = src;
            a.download = name || 'galeria-imagem';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        function setBodyBackground(src) {
            document.body.style.setProperty('--bg-image', `url('${src}')`);
            document.body.classList.add('body-background-image');
            currentBgImage = src;
        }

        function openStickerContextMenu(event, stickerId) {
            event.preventDefault();
            contextMenuStickerId = stickerId;
            const menu = document.getElementById('sticker-context-menu');
            menu.style.display = 'block';
            menu.style.left = `${event.clientX}px`;
            menu.style.top = `${event.clientY}px`;
            bringToFront(menu);
        }

        function removeStickerFromGallery() {
            if (contextMenuStickerId) {
                stickersData = stickersData.filter(sticker => sticker.id !== contextMenuStickerId);
                renderStickers();
            }
            document.getElementById('sticker-context-menu').style.display = 'none';
        }

        function resizeImage(file, callback) {
            const MAX_WIDTH = 250;
            const MAX_HEIGHT = 250;
            const reader = new FileReader();

            reader.onload = (e) => {
                if (file.type === 'image/gif') {
                    callback(e.target.result);
                    return;
                }

                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const dataUrl = file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
                    callback(dataUrl);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }


        function handleStickerUpload(event) {
            const files = event.target.files;
            for (const file of files) {
                resizeImage(file, (resizedSrc) => {
                    addStickerToGallery({ src: resizedSrc });
                });
            }
            event.target.value = ''; 
        }

        function addStickerToGallery(stickerData) {
            const newSticker = {
                id: `sticker-${Date.now()}-${Math.random()}`,
                src: stickerData.src,
            };
            stickersData.push(newSticker);
            renderStickers();
        }

        function renderStickers() {
            const stickersContent = document.getElementById('stickers-content');
            stickersContent.innerHTML = '';
            stickersData.forEach(stickerData => {
                const thumb = document.createElement('div');
                thumb.className = 'sticker-thumbnail clipped';
                thumb.id = stickerData.id;
                thumb.setAttribute('oncontextmenu', `openStickerContextMenu(event, '${stickerData.id}')`);
                
                thumb.innerHTML = `
                    <img src="${stickerData.src}" alt="Figurinha" onclick="openLightbox('${stickerData.src}')">
                    <button class="btn-primary sticker-send-btn" onclick="sendStickerToChat('${stickerData.src}')">Enviar</button>
                `;
                stickersContent.appendChild(thumb);
            });
        }

        function sendStickerToChat(imageUrl) {
            const messageText = `<img src="${imageUrl}" alt="Figurinha" style="width: 150px; height: auto; border-radius: 8px; background-color: var(--color-bg-tertiary); padding: 2px;">`;
            sendMessage({ text: messageText });
        }


        // --- PLAYER PRESENCE & REAL-TIME SYNC ---
        function updatePresence() {
            const charName = document.getElementById('char-name').value.trim();
            if (!charName) return;

            // MODIFICADO: Agora envia todos os dados de combate.
            const playerData = {
                version: 'v36_player_combat',
                theme: localStorage.getItem('characterSheetTheme') || 'onenari',
                charName: charName,
                image: document.getElementById('image-preview').src,
                combatImage: document.getElementById('combat-image-preview').src, // Imagem de Combate
                attributes: {
                    destreza: document.getElementById('destreza').value,
                    forca: document.getElementById('forca').value,
                    fortitude: document.getElementById('fortitude').value,
                    discernimento: document.getElementById('discernimento').value,
                    criatividade: document.getElementById('criatividade').value,
                    vontade: document.getElementById('vontade').value,
                },
                vitals: {
                    vigor: document.getElementById('vigor').value,
                    estresse: document.getElementById('estresse').value,
                },

                conditions: [], // Condições
                last_seen: firebase.firestore.FieldValue.serverTimestamp()
            };



            // Coletar Condições
            document.querySelectorAll('#conditions-container input:checked').forEach(checkbox => {
                playerData.conditions.push(checkbox.id);
            });

            // Envia os dados completos para o Firestore
            playersCollection.doc(charName).set(playerData, { merge: true });
        }

        function startPresenceSystem() {
            const charName = document.getElementById('char-name').value.trim();
            if (!charName) return;

            if (unsubscribePlayerListener) unsubscribePlayerListener();
            
            updatePresence();

            if (presenceInterval) clearInterval(presenceInterval);
            presenceInterval = setInterval(updatePresence, 60 * 1000); 

            listenForMySheetChanges(charName);
        }

        function listenForMySheetChanges(charName) {
            unsubscribePlayerListener = playersCollection.doc(charName).onSnapshot(doc => {
                if (!doc.exists) return;
                const data = doc.data();

                const localVigor = parseInt(document.getElementById('vigor').value);
                if (data.vigor !== localVigor) {
                    document.getElementById('vigor').value = data.vigor;
                    updateVigorBar();
                }

                const serverConditions = data.conditions || [];
                document.querySelectorAll('#conditions-container input').forEach(cb => {
                    cb.checked = serverConditions.includes(cb.id);
                });
                updateActiveEffects();
            });
        }

        // --- DRAGGABLE/RESIZABLE WINDOW ---
        function makeWindowDraggable(win, handle) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            handle.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e = e || window.event;
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                win.style.top = (win.offsetTop - pos2) + "px";
                win.style.left = (win.offsetLeft - pos1) + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        }


        // --- INITIALIZATION ---
        function populateSubTabs() {
            const acoesContainer = document.getElementById('acoes');
            const bonusContainer = document.getElementById('bonus');
            const onusContainer = document.getElementById('onus');
            const condicoesContainer = document.getElementById('condicoes');

            const createCollapsibleList = (items) => {
                return items.map(item => `
                    <div class="clipped">
                        <div class="flex justify-between items-center cursor-pointer p-2 hover:bg-tertiary rounded-md" onclick="toggleDescription(this)">
                            <div class="flex-grow pr-4">
                                <strong class="font-semibold text-primary">${item.name}</strong>
                                <p class="text-xs text-secondary description-summary">${item.description}</p>
                            </div>
                            <svg class="arrow w-4 h-4 text-secondary transition-transform flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                        </div>
                        <div class="description hidden mt-1 p-2 pl-4 ml-2 border-l-2 border-color text-primary">
                            <p>${item.description}</p>
                        </div>
                    </div>
                `).join('');
            };

            if (acoesContainer) acoesContainer.innerHTML = `<h3 class="font-bold text-lg text-primary mb-2">${allActions.title}</h3><div class="space-y-1">${createCollapsibleList(allActions.items)}</div>`;
            if (bonusContainer) bonusContainer.innerHTML = `<h3 class="font-bold text-lg text-primary mb-2">BÔNUS</h3><div class="space-y-1">${createCollapsibleList(Object.values(allConditions).filter(c => c.type === 'bonus'))}</div>`;
            if (onusContainer) onusContainer.innerHTML = `<h3 class="font-bold text-lg text-primary mb-2">ÔNUS</h3><div class="space-y-1">${createCollapsibleList(Object.values(allConditions).filter(c => c.type === 'onus'))}</div>`;
            if (condicoesContainer) condicoesContainer.innerHTML = `<h3 class="font-bold text-lg text-primary mb-2">CONDIÇÕES</h3><div class="space-y-1">${createCollapsibleList(Object.values(allConditions).filter(c => c.type === 'condition'))}</div>`;
        }

        document.addEventListener('DOMContentLoaded', () => {
            // Populate Tabs Content
            const interpretacaoContent = `
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="space-y-6">
                        <section class="bg-secondary p-5 rounded-lg shadow-lg clipped">
                            <div class="border-b border-color"><nav class="-mb-px flex space-x-2" aria-label="Ability Tabs"><button onclick="switchAbilityTab(event, 'archetype')" class="ability-tab-button active whitespace-nowrap py-2 px-3 border-b-2 border-transparent font-medium text-sm rounded-t-md text-secondary">Arquétipo</button><button onclick="switchAbilityTab(event, 'lineages')" class="ability-tab-button whitespace-nowrap py-2 px-3 border-b-2 border-transparent font-medium text-sm rounded-t-md text-secondary">Linhagens</button><button onclick="switchAbilityTab(event, 'tricks')" class="ability-tab-button whitespace-nowrap py-2 px-3 border-b-2 border-transparent font-medium text-sm rounded-t-md text-secondary">Truques</button></nav></div>
                            <div class="mt-4">
                                <div id="archetype" class="ability-tab-content active">
                                    <div id="archetype-container" class="space-y-2"></div>
                                    <button onclick="addExpandableItem('archetype-container')" class="mt-4 btn-primary py-2 px-4 rounded-md transition-colors w-full">+ Adicionar</button>
                                </div>
                                <div id="lineages" class="ability-tab-content">
                                    <div id="lineages-container" class="space-y-2"></div>
                                    <button onclick="addExpandableItem('lineages-container')" class="mt-4 btn-primary py-2 px-4 rounded-md transition-colors w-full">+ Adicionar</button>
                                </div>
                                <div id="tricks" class="ability-tab-content">
                                    <div id="tricks-container" class="space-y-2"></div>
                                    <button onclick="addExpandableItem('tricks-container')" class="mt-4 btn-primary py-2 px-4 rounded-md transition-colors w-full">+ Adicionar</button>
                                </div>
                            </div>
                        </section>
                        <section class="bg-secondary p-5 rounded-lg shadow-lg clipped"><h2 class="font-condensed text-xl text-accent border-b border-color pb-2 mb-4">APTIDÕES</h2><textarea id="aptidoes-textarea" class="w-full h-24 rounded-md p-2 clipped" placeholder="Descreva suas aptidões..."></textarea></section>
                        <section class="bg-secondary p-5 rounded-lg shadow-lg clipped"><h2 class="font-condensed text-xl text-accent border-b border-color pb-2 mb-4">ITENS MUNDANOS</h2><textarea id="itens-mundanos-textarea" class="w-full h-32 rounded-md p-2 clipped" placeholder="Liste seus itens mundanos..."></textarea></section>
                    </div>
                    <div class="space-y-6">
                        <section class="bg-secondary p-5 rounded-lg shadow-lg clipped">
                            <h2 class="font-condensed text-xl text-accent border-b border-color pb-2 mb-4">IDEAIS</h2>
                            <div class="flex items-start justify-between gap-2">
                                <div class="w-5/12 text-center">
                                    <input type="text" id="ideal1-text" placeholder="Ideal 1..." class="w-full bg-tertiary text-primary rounded-md p-2 text-center clipped">
                                    <div id="ideal1-counter" class="text-3xl font-bold mt-2 text-primary">0</div>
                                </div>
                                <div class="w-2/12 flex flex-col items-center justify-start pt-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-accent mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 6l3 1m0 0l-3 9a2 2 0 002 2h10a2 2 0 002-2l-3-9m-9 9l3-9m6 9l-3-9m0 0l-3 9m-3-9h6m-6 0l-3-1m3 1l3 1m0 0l3-1m-3 1V3m0 0L9 2m3 1l3-1" />
                                    </svg>
                                    <div class="flex gap-4 mt-2">
                                        <button onclick="adjustIdeals(-1)" class="p-1 rounded-full bg-tertiary hover:bg-accent transition-colors">
                                            <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                                        </button>
                                        <button onclick="adjustIdeals(1)" class="p-1 rounded-full bg-tertiary hover:bg-accent transition-colors">
                                            <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="w-5/12 text-center">
                                    <input type="text" id="ideal2-text" placeholder="Ideal 2..." class="w-full bg-primary text-primary rounded-md p-2 text-center clipped">
                                    <div id="ideal2-counter" class="text-3xl font-bold mt-2 text-primary">0</div>
                                </div>
                            </div>
                        </section>
                        <section class="bg-secondary p-5 rounded-lg shadow-lg clipped">
                            <div class="border-b border-color"><nav class="-mb-px flex space-x-2" aria-label="Item Tabs"><button onclick="switchItemTab(event, 'itens-especiais')" class="item-tab-button active whitespace-nowrap py-2 px-3 border-b-2 border-transparent font-medium text-sm rounded-t-md text-secondary">Itens Especiais</button><button onclick="switchItemTab(event, 'magias')" class="item-tab-button whitespace-nowrap py-2 px-3 border-b-2 border-transparent font-medium text-sm rounded-t-md text-secondary">Magias</button><button onclick="switchItemTab(event, 'card-de-itens')" class="item-tab-button whitespace-nowrap py-2 px-3 border-b-2 border-transparent font-medium text-sm rounded-t-md text-secondary">Card de Itens</button><button onclick="switchItemTab(event, 'recursos')" class="item-tab-button whitespace-nowrap py-2 px-3 border-b-2 border-transparent font-medium text-sm rounded-t-md text-secondary">Recursos</button></nav></div>
                            <div class="mt-4">
                                <div id="itens-especiais" class="item-tab-content active">
                                    <textarea id="itens-especiais-textarea" class="w-full rounded-md p-2 clipped auto-resize" placeholder="Liste seus itens especiais..." oninput="autoResizeTextarea(this)"></textarea>
                                </div>
                                <div id="magias" class="item-tab-content">
                                    <div id="spells-container" class="space-y-4 pr-2"></div>
                                    <button onclick="addSpell()" class="mt-4 btn-primary py-2 px-4 rounded-md transition-colors w-full">+ Adicionar Magia</button>
                                </div>
                                <div id="card-de-itens" class="item-tab-content">
                                    <div id="item-cards-container" class="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-2"></div>
                                    <button onclick="addItemCard()" class="mt-4 btn-primary py-2 px-4 rounded-md transition-colors w-full">+ Adicionar Card</button>

                                </div>
                                <div id="recursos" class="item-tab-content">
                                    <div id="recursos-container" class="space-y-4 pr-2"></div>
                                    <button onclick="addResource()" class="mt-4 btn-primary py-2 px-4 rounded-md transition-colors w-full">+ Adicionar Recurso</button>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>`;
            document.getElementById('interpretacao').innerHTML = interpretacaoContent;

            const confrontoContent = `
                <section id="efeitos-ativos" class="mb-6 bg-secondary/50 p-5 rounded-lg shadow-lg border border-color clipped"><h2 class="font-condensed text-xl text-accent border-b border-color pb-2 mb-4">EFEITOS ATIVOS</h2><div id="active-special" class="space-y-2 mb-4"></div><div id="active-onus" class="space-y-2 mb-4"></div><div id="active-bonus" class="space-y-2"></div></section>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="space-y-6">
                        <section class="bg-secondary p-5 rounded-lg shadow-lg clipped"><h2 class="font-condensed text-xl text-accent border-b border-color pb-2 mb-4">SELECIONAR CONDIÇÕES</h2><div id="conditions-container" class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm"></div></section>
                        <section class="bg-secondary p-5 rounded-lg shadow-lg clipped"><h2 class="font-condensed text-xl text-accent border-b border-color pb-2 mb-4">DEFESAS</h2><div class="space-y-4"><div><label for="armor-name" class="font-medium mb-2 block">Nome da Armadura</label><input type="text" id="armor-name" placeholder="Nenhuma" class="w-full rounded-md p-2 clipped"></div><div class="flex items-center justify-between"><label class="font-medium text-lg">Armadura</label><div class="flex items-center justify-center space-x-2"><button onclick="updateValue('armadura-value', -1)" class="btn-secondary font-bold w-8 h-8 rounded-full transition-colors">-</button><input type="number" id="armadura-value" value="0" class="w-16 text-center text-xl font-bold rounded-md p-1"><button onclick="updateValue('armadura-value', 1)" class="btn-secondary font-bold w-8 h-8 rounded-full transition-colors">+</button></div></div><div class="flex items-center justify-between"><label class="font-medium text-lg">Escudo</label><div class="flex items-center justify-center space-x-2"><button onclick="updateValue('escudo-value', -1)" class="btn-secondary font-bold w-8 h-8 rounded-full transition-colors">-</button><input type="number" id="escudo-value" value="0" class="w-16 text-center text-xl font-bold rounded-md p-1"><button onclick="updateValue('escudo-value', 1)" class="btn-secondary font-bold w-8 h-8 rounded-full transition-colors">+</button></div></div></div></section>
                        <section class="bg-secondary p-5 rounded-lg shadow-lg clipped">
                            <h2 class="font-condensed text-xl text-accent border-b border-color pb-2 mb-4">IMAGEM DE COMBATE</h2>
                            <p class="text-sm text-secondary mb-4">Envie uma imagem com fundo transparente (PNG) para ser usada na tela de combate.</p>
                            <label for="combat-image-upload" class="cursor-pointer">
                                <div class="relative w-full h-48 rounded-md border-2 border-dashed border-color bg-tertiary flex items-center justify-center overflow-hidden hover:border-accent">
                                    <img id="combat-image-preview" src="" class="w-full h-full object-contain hidden" alt="Imagem de Combate">
                                    <span id="combat-image-placeholder" class="text-secondary text-center p-2">Adicionar Imagem de Combate</span>
                                </div>
                            </label>
                            <input type="file" id="combat-image-upload" class="hidden" accept="image/png,image/webp" onchange="handleCombatImageUpload(event)">
                        </section>
                    </div>
                    <section class="bg-secondary p-5 rounded-lg shadow-lg clipped"><h2 class="font-condensed text-xl text-accent border-b border-color pb-2 mb-4">ARMAS E ATAQUES</h2><div id="weapons-list" class="space-y-3"><div class="hidden md:grid grid-cols-12 gap-4 text-sm text-secondary font-semibold px-2"><div class="col-span-3">NOME</div><div class="col-span-3">PROPRIEDADES</div><div class="col-span-1">DANO</div><div class="col-span-4">EFEITO ESPECIAL</div><div class="col-span-1"></div></div></div><button onclick="addWeapon()" class="mt-4 btn-primary py-2 px-4 rounded-md transition-colors w-full sm:w-auto">+ Adicionar Arma</button></section>
                </div>
                <footer class="mt-8"><div class="border-b border-color"><nav class="-mb-px flex space-x-4" aria-label="Tabs"><button onclick="switchSubTab(event, 'acoes')" class="sub-tab-button active whitespace-nowrap py-3 px-4 border-b-2 border-transparent font-medium text-sm text-secondary">AÇÕES BÁSICAS</button><button onclick="switchSubTab(event, 'bonus')" class="sub-tab-button whitespace-nowrap py-3 px-4 border-b-2 border-transparent font-medium text-sm text-secondary">BÔNUS</button><button onclick="switchSubTab(event, 'onus')" class="sub-tab-button whitespace-nowrap py-3 px-4 border-b-2 border-transparent font-medium text-sm text-secondary">ÔNUS</button><button onclick="switchSubTab(event, 'condicoes')" class="sub-tab-button whitespace-nowrap py-3 px-4 border-b-2 border-transparent font-medium text-sm text-secondary">CONDIÇÕES</button></nav></div><div class="mt-4 text-secondary text-sm space-y-4 leading-relaxed"><div id="acoes" class="sub-tab-content active"></div><div id="bonus" class="sub-tab-content"></div><div id="onus" class="sub-tab-content"></div><div id="condicoes" class="sub-tab-content"></div></div></footer>`;
            document.getElementById('confronto').innerHTML = confrontoContent;
            addWeapon();

            document.getElementById('image-upload').addEventListener('change', (e) => openCropper(e, 'character'));
            document.getElementById('crop-and-save-btn').addEventListener('click', confirmCrop);
            document.getElementById('cancel-crop-btn').addEventListener('click', closeCropper);

            const conditionContainer = document.getElementById('conditions-container');
            const sortedKeys = Object.keys(allConditions).sort((a, b) => allConditions[a].name.localeCompare(allConditions[b].name));
            sortedKeys.forEach(key => {
                const condition = allConditions[key];
                const checkboxHTML = `<div class="flex items-center"><input id="${key}" name="${key}" type="checkbox" class="hidden custom-checkbox" onchange="handleConditionChange(this)"><label for="${key}" class="cursor-pointer select-none transition-colors">${condition.name}</label></div>`;
                conditionContainer.innerHTML += checkboxHTML;
            });
            
            populateSubTabs();
            updateMaxVigor();
            updateActiveEffects();

            const switcherBtn = document.getElementById('theme-switcher-button');
            const switcherMenu = document.getElementById('theme-switcher-menu');
            switcherBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                switcherMenu.style.display = switcherMenu.style.display === 'block' ? 'none' : 'block';
            });
            document.addEventListener('click', () => {
                switcherMenu.style.display = 'none';
            });
            document.querySelectorAll('.theme-option').forEach(option => {
                option.addEventListener('click', () => {
                    applyTheme(option.dataset.theme);
                });
            });

            document.getElementById('annotations-button').addEventListener('click', () => { 
                const modal = document.getElementById('annotations-modal');
                modal.style.display = 'flex'; 
                bringToFront(modal);
            });
            document.getElementById('annotations-modal').addEventListener('click', (e) => { if (e.target.id === 'annotations-modal') e.target.style.display = 'none'; });
            document.getElementById('gallery-button').addEventListener('click', () => openGallery(false));
            document.getElementById('roll-test-modal').addEventListener('click', (e) => { if (e.target.id === 'roll-test-modal') closeRollModal(); });
            document.getElementById('custom-roll-modal').addEventListener('click', (e) => { if (e.target.id === 'custom-roll-modal') closeCustomRollModal(); });
            
            const toolbarOptions = [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic'],
                [{ 'color': [] }, { 'background': [] }],
            ];
            quill = new Quill('#annotations-editor', {
                modules: { toolbar: toolbarOptions },
                theme: 'snow'
            });
            
            document.getElementById('chat-toggle-button').addEventListener('click', toggleChat);
            document.getElementById('clear-chat-btn').addEventListener('click', () => {
                document.getElementById('chat-messages').innerHTML = '';
            });
            document.getElementById('chat-send-btn').addEventListener('click', () => {
                const input = document.getElementById('chat-input');
                sendMessage({ text: input.value });
                input.value = '';
            });
            document.getElementById('chat-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const input = document.getElementById('chat-input');
                    sendMessage({ text: input.value });
                    input.value = '';
                }
            });
            document.getElementById('custom-roll-btn').addEventListener('click', openCustomRollModal);
            document.getElementById('custom-roll-normal-btn').addEventListener('click', () => handleCustomRoll('normal'));
            document.getElementById('custom-roll-aptidao-btn').addEventListener('click', () => handleCustomRoll('aptidao'));

            document.getElementById('open-map-button').addEventListener('click', openMap);
            document.getElementById('close-map-btn').addEventListener('click', closeMap);
 

            document.getElementById('char-name').addEventListener('change', startPresenceSystem);
            
            makeWindowDraggable(document.getElementById('chat-window'), document.getElementById('chat-header'));
            makeWindowDraggable(document.getElementById('bulletin-board-window'), document.querySelector('#bulletin-board-window .interactive-window-header'));


            const windows = document.querySelectorAll('#chat-window, #map-modal, .modal-overlay, #bulletin-board-window');
            windows.forEach(win => {
                win.addEventListener('mousedown', () => bringToFront(win), true);
            });
            
            document.getElementById('bulletin-board-toggle-button').addEventListener('click', toggleBulletinBoard);
            

            document.getElementById('sticker-remove-btn').addEventListener('click', removeStickerFromGallery);
            document.addEventListener('click', () => {
                document.getElementById('sticker-context-menu').style.display = 'none';
            });

            checkFirebaseConfig();
            const savedTheme = localStorage.getItem('characterSheetTheme') || 'onenari';
            applyTheme(savedTheme);
        });