// --- VARIÁVEIS GLOBAIS DO FIREBASE (Inicializadas depois) ---
        let db, storage, messagesCollection, playersCollection, bulletinBoardCollection, bulletinStateRef;
        let appInitialized = false;

        // --- NOVO: LÓGICA DE CONEXÃO DINÂMICA ---
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
                openFirebaseModal();
            }
        }

        function openFirebaseModal() {
            const modal = document.getElementById('firebase-config-modal');
            if (modal) modal.style.display = 'flex';
        }

        function saveAndConnectFirebase() {
            const config = {
                apiKey: document.getElementById('fb-apiKey').value.trim(),
                authDomain: document.getElementById('fb-authDomain').value.trim(),
                projectId: document.getElementById('fb-projectId').value.trim(),
                storageBucket: document.getElementById('fb-storageBucket').value.trim(),
                messagingSenderId: document.getElementById('fb-messagingSenderId').value.trim(),
                appId: document.getElementById('fb-appId').value.trim()
            };

            if (!config.apiKey || !config.projectId) {
                alert("Pelo menos API Key e Project ID são obrigatórios.");
                return;
            }

            localStorage.setItem('rpg_firebase_config', JSON.stringify(config));
            document.getElementById('firebase-config-modal').style.display = 'none';
            
            // Recarrega a página para aplicar a nova configuração
            location.reload();
        }

        function clearFirebaseConfig() {
            if (confirm("Deseja desconectar e apagar as configurações salvas deste navegador?")) {
                localStorage.removeItem('rpg_firebase_config');
                location.reload();
            }
        }

        // --- NOVO: FUNÇÕES DO MODAL DE CONFIG ---
        function openConfigModal() {
            const modal = document.getElementById('config-modal');
            modal.style.display = 'flex';
            bringToFront(modal);
        }

        function closeConfigModal() {
            document.getElementById('config-modal').style.display = 'none';
        }

        function generateTableKey() {
            const savedConfig = localStorage.getItem('rpg_firebase_config');
            if (!savedConfig) {
                alert("Nenhuma conexão Firebase ativa. Conecte-se primeiro.");
                return;
            }

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(savedConfig);
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "chave_mesa_rpg.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }

        function loadTableKey(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const config = JSON.parse(e.target.result);
                    // Validação simples
                    if (config.apiKey && config.projectId) {
                        localStorage.setItem('rpg_firebase_config', JSON.stringify(config));
                        alert("Chave da mesa carregada! O painel será reiniciado.");
                        location.reload();
                    } else {
                        alert("Arquivo JSON inválido. Não parece ser uma chave de mesa.");
                    }
                } catch (error) {
                    console.error("Erro ao carregar chave:", error);
                    alert("Arquivo JSON inválido ou corrompido.");
                }
            };
            reader.readAsText(file);
            event.target.value = ''; // Limpa o input
        }

        // --- INICIALIZAÇÃO DO FIREBASE (MODIFICADA) ---
        function initializeFirebase(config) {
            if (appInitialized) return;

            try {
                firebase.initializeApp(config);
                
                db = firebase.firestore();
                storage = firebase.storage();
                messagesCollection = db.collection('chat_messages');
                playersCollection = db.collection('players');
                bulletinBoardCollection = db.collection('bulletin_board_messages');
                bulletinStateRef = db.collection('game_state').doc('bulletin_board');

                appInitialized = true;
                console.log("Painel do Mestre conectado ao Firebase!");

                // --- INICIA OS LISTENERS DO PM ---
                listenForMessages();
                // ListenForOnlinePlayers foi removido daqui pois está no dm.html
                listenForBulletinMessages();

            } catch (e) {
                console.error("Erro ao inicializar Firebase:", e);
                alert("Erro na configuração do Firebase. Limpando dados salvos...");
                clearFirebaseConfig();
            }
        }
        
        // --- ARMAZENAMENTO LOCAL DE DADOS ---
        let localNpcs = {};
        let localBestiary = {};
        let localEvents = {};
        let localNotes = {};
        let localGallery = { 'default': { name: 'Geral', images: [] } };
        let localStickers = [];
        let currentBgImage = '';

        // --- DADOS GLOBAIS ---
        const defaultThemes = {
            'cineria': { name: 'Cinéria' },
            'onenari': { name: 'Onenari' },
            'klon': { name: 'Klon' },
            'valver': { name: 'Valver' },
            'echo': { name: 'Echo' }
        };
        const attributes = ['Força', 'Fortitude', 'Destreza', 'Criatividade', 'Discernimento', 'Vontade'];
        const allConditions = {
            'protegido': { name: 'Protegido (x)', type: 'bonus', description: 'Reduz o dano ao Vigor em X.' }, 
            'vantagem': { name: 'Vantagem', type: 'bonus', description: 'Recebe +2 em um teste ou realiza uma ação extra.'}, 
            'inspirado': { name: 'Inspirado', type: 'bonus', description: '+1 em Criatividade. Pode gastar para remover ônus mental.', effects: [{ attr: 'criatividade', mod: 1 }] },
            'focado': { name: 'Focado', type: 'bonus', description: '+1 em Discernimento. Pode gastar para rerrolar um teste.', effects: [{ attr: 'discernimento', mod: 1 }] },
            'fortalecido': { name: 'Fortalecido', type: 'bonus', description: '+1 em Força e Fortitude. Causa +1 de dano.', effects: [{ attr: 'forca', mod: 1 }, { attr: 'fortitude', mod: 1 }] },
            'impetuoso': { name: 'Impetuoso', type: 'bonus', description: 'Pode gastar para realizar um turno extra.' },
            'agilizado': { name: 'Agilizado', type: 'bonus', description: '+1 em Destreza e +3m de Deslocamento.', effects: [{ attr: 'destreza', mod: 1 }] },
            'preparado': { name: 'Preparado', type: 'bonus', description: 'Pode gastar para evitar o próximo Ônus.' },
            'revitalizado': { name: 'Revitalizado', type: 'bonus', description: 'Recupera 1 de Vigor no início do turno.' },
            'motivado': { name: 'Motivado', type: 'bonus', description: '+1 em Vontade. Pode gastar para remover Estresse ou recuperar Vigor.', effects: [{ attr: 'vontade', mod: 1 }] },
            'destemido': { name: 'Destemido', type: 'bonus', description: '+1 na iniciativa. Pode gastar para evitar a condição Apavorado.' },
            'vulneravel': { name: 'Vulnerável (x)', type: 'onus', description: 'Aumenta o dano ao Vigor recebido em X.' },
            'desmotivado': { name: 'Desmotivado', type: 'onus', description: '-2 em Vontade. Não pode recuperar Vigor.', effects: [{ attr: 'vontade', mod: -2 }] },
            'enfraquecido': { name: 'Enfraquecido', type: 'onus', description: '-1 em Força. Causa -1 de dano.', effects: [{ attr: 'forca', mod: -1 }] },
            'lento': { name: 'Lento', type: 'onus', description: '-3m de Deslocamento. Não pode usar turnos extras.' },
            'desvantagem': { name: 'Desvantagem', type: 'onus', description: '-2 no próximo teste. Apenas uma ação por turno.' },
            'em-apuros': { name: 'Em apuros', type: 'onus', description: 'Recebe 1 de dano ao Vigor no início do turno.' },
            'preso': { name: 'Preso', type: 'onus', description: '-2 em Destreza. Deslocamento é 0.', effects: [{ attr: 'destreza', mod: -2 }] },
            'cansado': { name: 'Cansado', type: 'onus', description: '-1 em todos os testes. Deslocamento pela metade.', effects: [
                { attr: 'forca', mod: -1 }, { attr: 'fortitude', mod: -1 }, { attr: 'destreza', mod: -1 },
                { attr: 'criatividade', mod: -1 }, { attr: 'discernimento', mod: -1 }, { attr: 'vontade', mod: -1 }
            ]},
            'desorientado': { name: 'Desorientado', type: 'onus', description: '-1 em Discernimento. Ganha 1 nível de Estresse.', effects: [{ attr: 'discernimento', mod: -1 }] },
            'assustado': { name: 'Assustado', type: 'onus', description: '-2 em Criatividade. Não pode agir contra a fonte do medo.', effects: [{ attr: 'criatividade', mod: -2 }] },
            'ferido': { name: 'Ferido', type: 'onus', description: '-2 em Fortitude. Se sem Vigor, fica Enfraquecido.', effects: [{ attr: 'fortitude', mod: -2 }] },
        };

        // --- ESTADO GLOBAL DA UI ---
        let quill, eventQuill, noteQuill;
        let cropper;
        let currentEditorTarget = { type: null, id: null };
        let currentCropperTarget = { type: null, id: null, previewElementId: null };
        let activeEntity = { type: null, id: null };
        let activeNote = { type: null, id: null };
        let isChatOpen = false;
        let isBulletinBoardOpen = false;
        let audioCtx;
        // let unsubscribePlayersListener = null; // Removido
        let highestZIndex = 151;
        let activeFolderId = 'default';

        // --- LÓGICA DE NAVEGAÇÃO ---
        function switchTab(event, tabName) {
            document.querySelectorAll('.main-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.main-tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
             if (tabName === 'galeria') {
                renderFolderList();
                renderGallery();
                renderStickers();
            }
        }
        function switchSubTab(event, tabName) {
            document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.sub-tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
        }
        function switchGalleryTab(event, tabName) {
            document.querySelectorAll('.gallery-tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.gallery-tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        // --- LÓGICA DE CRIAÇÃO DE INTERFACE (UI) ---
        function createEntityInterface(type) {
            const container = document.getElementById(type === 'npc' ? 'npcs' : 'bestiario');
            const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
            const title = capitalizedType === 'Npc' ? 'NPCs' : 'Bestiário';

            container.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="md:col-span-1 bg-secondary p-4 rounded-lg">
                        <h2 class="text-xl font-bold mb-4">Lista de ${title}</h2>
                        <div id="${type}-list" class="space-y-2 max-h-[75vh] overflow-y-auto pr-2"></div>
                    </div>
                    <div class="md:col-span-2">
                        <button id="new-${type}-btn" class="btn btn-primary w-full mb-4">Criar Novo ${capitalizedType}</button>
                        <div id="${type}-form-container" class="hidden bg-secondary p-5 rounded-lg">
                             <input type="hidden" id="${type}-id">
                             <div class="flex flex-col sm:flex-row gap-6 items-start">
                                <!-- Coluna da Esquerda -->
                                <div class="flex-shrink-0 w-full sm:w-48">
                                    <h3 class="font-bold text-center mb-2" style="color: var(--color-accent);">Imagem</h3>
                                    <label for="${type}-image-upload" class="cursor-pointer">
                                        <div class="w-32 h-32 mx-auto rounded-full bg-tertiary flex items-center justify-center overflow-hidden" style="border: 4px solid var(--color-border);">
                                            <img id="${type}-image-preview" src="" class="w-full h-full object-cover hidden" alt="Foto">
                                            <span id="${type}-image-placeholder" class="text-center text-sm p-2" style="color: var(--color-text-secondary);">Adicionar Foto</span>
                                        </div>
                                    </label>
                                    <input type="file" id="${type}-image-upload" class="hidden" accept="image/*">
                                    <h3 class="font-bold text-center mt-6 mb-2" style="color: var(--color-accent);">Atributos</h3>
                                    <div id="${type}-attributes" class="space-y-2"></div>
                                </div>
                                <!-- Coluna da Direita -->
                                <div class="flex-grow w-full">
                                    <input type="text" id="${type}-name" placeholder="Nome do ${capitalizedType}" class="w-full p-2 rounded-md text-xl font-bold mb-4">
                                    <label class="font-bold mb-1 block" style="color: var(--color-accent);">Personalidade</label>
                                    <textarea id="${type}-personality" class="w-full h-24 p-2 rounded-md mb-4"></textarea>
                                    <label class="font-bold mb-1 block" style="color: var(--color-accent);">Geral</label>
                                    <textarea id="${type}-general" class="w-full h-40 p-2 rounded-md"></textarea>
                                </div>
                             </div>
                             <!-- Vigor Bar Section -->
                             <div class="mt-4">
                                <h3 class="font-bold mb-2" style="color: var(--color-accent);">Vigor</h3>
                                <div class="flex items-center gap-4 mb-2">
                                    <div>
                                        <label for="${type}-vigor" class="text-sm" style="color: var(--color-text-secondary);">Atual</label>
                                        <input type="number" id="${type}-vigor" value="10" class="w-20 text-center p-1 rounded-md">
                                    </div>
                                    <div>
                                        <label for="${type}-maxVigor" class="text-sm" style="color: var(--color-text-secondary);">Máximo</label>
                                        <input type="number" id="${type}-maxVigor" value="10" class="w-20 text-center p-1 rounded-md">
                                    </div>
                                </div>
                                <div class="vigor-bar-container">
                                    <div id="${type}-vigor-bar" class="vigor-bar"></div>
                                    <span id="${type}-vigor-text" class="vigor-bar-text">10 / 10</span>
                                </div>
                             </div>
                             <!-- Botões de Ação -->
                             <div class="flex items-center gap-2 mt-6">
                                <button id="save-${type}-btn" class="btn btn-primary">Salvar Ficha</button>
                                <button id="delete-${type}-btn" class="btn btn-danger" disabled>Excluir</button>
                                <button id="skills-${type}-btn" class="btn btn-secondary p-2 ml-auto" disabled>
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                </button>
                             </div>
                        </div>
                    </div>
                </div>`;
            
            const attributesContainer = document.getElementById(`${type}-attributes`);
            attributes.forEach(attr => {
                const attrId = attr.toLowerCase();
                attributesContainer.innerHTML += `
                    <div class="flex items-center justify-between text-sm">
                        <label id="label-${type}-${attrId}" for="${type}-${attrId}" class="cursor-pointer hover:text-accent">${attr}</label>
                        <input type="number" id="${type}-${attrId}" value="0" class="w-14 text-center rounded-md p-1">
                    </div>`;
            });
            
            attributes.forEach(attr => {
                const attrId = attr.toLowerCase();
                 document.getElementById(`label-${type}-${attrId}`).addEventListener('click', () => {
                    const entityId = document.getElementById(`${type}-id`).value;
                    if (!entityId) return;
                    
                    const dataStore = type === 'npc' ? localNpcs : localBestiary;
                    const entityData = dataStore[entityId];
                    if (!entityData) return;

                    const entityName = entityData.name;
                    const attrValue = entityData.attributes[attrId] || 0;
                    
                    let totalModifier = 0;
                    const effectSources = [];

                    if (entityData.effects && entityData.effects.length > 0) {
                        entityData.effects.forEach(effectKey => {
                            const condition = allConditions[effectKey];
                            if (condition && condition.effects) {
                                condition.effects.forEach(effect => {
                                    if (effect.attr === attrId) {
                                        totalModifier += effect.mod;
                                        effectSources.push({ name: condition.name.replace(/\s\(x\)$/, ''), type: condition.type });
                                    }
                                });
                            }
                        });
                    }
                    openAttributeRollModal(entityName, attr, attrValue, totalModifier, effectSources);
                });
            });

            document.getElementById(`new-${type}-btn`).addEventListener('click', () => showForm(type));
            document.getElementById(`save-${type}-btn`).addEventListener('click', () => saveEntity(type));
            document.getElementById(`delete-${type}-btn`).addEventListener('click', () => deleteEntity(type));
            document.getElementById(`skills-${type}-btn`).addEventListener('click', () => openSkillsWindow(type));
            document.getElementById(`${type}-image-upload`).addEventListener('change', (e) => handleImageUpload(e, type));

            // Vigor bar listeners
            document.getElementById(`${type}-vigor`).addEventListener('input', () => updateVigorBar(type));
            document.getElementById(`${type}-maxVigor`).addEventListener('input', () => updateVigorBar(type));
        }

        function createNoteInterface(type) {
            const container = document.getElementById(type === 'evento' ? 'eventos' : 'anotacoes');
            const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
            const title = capitalizedType === 'Evento' ? 'Eventos' : 'Anotações';

            container.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="md:col-span-1 bg-secondary p-4 rounded-lg">
                        <h2 class="text-xl font-bold mb-4">Lista de ${title}</h2>
                        <div id="${type}-list" class="space-y-2 max-h-[75vh] overflow-y-auto pr-2"></div>
                    </div>
                    <div class="md:col-span-2">
                        <button id="new-${type}-btn" class="btn btn-primary w-full mb-4">Criar ${capitalizedType}</button>
                        <div id="${type}-form-container" class="hidden bg-secondary p-5 rounded-lg">
                             <input type="hidden" id="${type}-id">
                             <input type="text" id="${type}-title" placeholder="Título do ${capitalizedType}" class="w-full p-2 rounded-md text-xl font-bold mb-4">
                             <div id="${type}-editor-container" class="h-96"></div>
                             <!-- Botões de Ação -->
                             <div class="flex items-center gap-2 mt-6">
                                <button id="save-${type}-btn" class="btn btn-primary">Salvar</button>
                                <button id="delete-${type}-btn" class="btn btn-danger" disabled>Excluir</button>
                                <button id="case-change-${type}-btn" class="btn btn-secondary ml-auto" title="Mudar Caixa do Texto Selecionado">Aa</button>
                             </div>
                        </div>
                    </div>
                </div>`;
            
            document.getElementById(`new-${type}-btn`).addEventListener('click', () => showNoteForm(type));
            document.getElementById(`save-${type}-btn`).addEventListener('click', () => saveNote(type));
            document.getElementById(`delete-${type}-btn`).addEventListener('click', () => deleteNote(type));
             document.getElementById(`case-change-${type}-btn`).addEventListener('click', () => {
                const q = type === 'evento' ? eventQuill : noteQuill;
                const range = q.getSelection();
                if (range && range.length > 0) {
                    const text = q.getText(range.index, range.length);
                    if (text === text.toUpperCase()) {
                        q.formatText(range.index, range.length, 'text', text.toLowerCase());
                    } else {
                        q.formatText(range.index, range.length, 'text', text.toUpperCase());
                    }
                }
            });
        }

        function showForm(type, entityId = null, data = {}) {
            activeEntity = { type, id: entityId };
            
            document.getElementById(`${type}-form-container`).classList.remove('hidden');
            document.getElementById(`${type}-id`).value = entityId || '';
            
            document.getElementById(`${type}-name`).value = data.name || '';
            document.getElementById(`${type}-personality`).value = data.personality || '';
            document.getElementById(`${type}-general`).value = data.general || '';
            
            const preview = document.getElementById(`${type}-image-preview`);
            const placeholder = document.getElementById(`${type}-image-placeholder`);
            if (data.image) {
                preview.src = data.image;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
            } else {
                preview.src = '';
                preview.classList.add('hidden');
                placeholder.classList.remove('hidden');
            }
            
            attributes.forEach(attr => {
                const attrId = attr.toLowerCase();
                document.getElementById(`${type}-${attrId}`).value = data.attributes ? (data.attributes[attrId] || 0) : 0;
            });

            document.getElementById(`${type}-vigor`).value = data.vigor || 10;
            document.getElementById(`${type}-maxVigor`).value = data.maxVigor || 10;
            updateVigorBar(type);

            document.getElementById(`delete-${type}-btn`).disabled = !entityId;
            document.getElementById(`skills-${type}-btn`).disabled = !entityId;
        }

        function showNoteForm(type, noteId = null, data = {}) {
            activeNote = { type, id: noteId };
            const formContainer = document.getElementById(`${type}-form-container`);
            formContainer.classList.remove('hidden');
            document.getElementById(`${type}-id`).value = noteId || '';
            document.getElementById(`${type}-title`).value = data.title || '';
            
            const quill = type === 'evento' ? eventQuill : noteQuill;
            quill.root.innerHTML = data.content || '';

            document.getElementById(`delete-${type}-btn`).disabled = !noteId;
        }

        function renderEntityList(type) {
            const dataStore = type === 'npc' ? localNpcs : localBestiary;
            const listContainer = document.getElementById(`${type}-list`);
            listContainer.innerHTML = '';
            
            const sortedKeys = Object.keys(dataStore).sort((a, b) => 
                (dataStore[a].name || '').localeCompare(dataStore[b].name || '')
            );

            if (sortedKeys.length === 0) {
                listContainer.innerHTML = `<p class="text-sm" style="color: var(--color-text-secondary);">Nenhuma ficha criada.</p>`;
                return;
            }

            sortedKeys.forEach(id => {
                const entity = dataStore[id];
                const card = document.createElement('div');
                card.className = 'entity-card p-3 rounded-lg flex items-center gap-4';
                card.dataset.id = id;
                card.onclick = () => {
                    document.querySelectorAll(`#${type}-list .entity-card`).forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    showForm(type, id, entity);
                };
                card.innerHTML = `
                    <img src="${entity.image || 'https://placehold.co/48x48/222222/888888?text=?'}" class="w-12 h-12 rounded-full object-cover flex-shrink-0">
                    <span class="font-bold flex-grow truncate">${entity.name || 'Sem Nome'}</span>
                `;
                listContainer.appendChild(card);
            });
        }

        function renderNoteList(type) {
            const dataStore = type === 'evento' ? localEvents : localNotes;
            const listContainer = document.getElementById(`${type}-list`);
            listContainer.innerHTML = '';

            const sortedKeys = Object.keys(dataStore).sort((a, b) => 
                (dataStore[a].title || '').localeCompare(dataStore[b].title || '')
            );

             if (sortedKeys.length === 0) {
                listContainer.innerHTML = `<p class="text-sm" style="color: var(--color-text-secondary);">Nenhum item criado.</p>`;
                return;
            }

            sortedKeys.forEach(id => {
                const note = dataStore[id];
                const card = document.createElement('div');
                card.className = 'entity-card p-3 rounded-lg';
                card.dataset.id = id;
                card.onclick = () => {
                    document.querySelectorAll(`#${type}-list .entity-card`).forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    showNoteForm(type, id, note);
                };
                card.innerHTML = `<span class="font-bold truncate">${note.title || 'Sem Título'}</span>`;
                listContainer.appendChild(card);
            });
        }

        function updateVigorBar(type) {
            const vigorInput = document.getElementById(`${type}-vigor`);
            const maxVigorInput = document.getElementById(`${type}-maxVigor`);
            
            let vigor = parseInt(vigorInput.value) || 0;
            let maxVigor = parseInt(maxVigorInput.value) || 1; // Default to 1 to avoid division by zero
            
            if (vigor < 0) vigor = 0;
            if (maxVigor < 1) maxVigor = 1;
            if (vigor > maxVigor) vigor = maxVigor;

            // Update input if value was corrected
            vigorInput.value = vigor;
            maxVigorInput.value = maxVigor;

            const percentage = maxVigor > 0 ? (vigor / maxVigor) * 100 : 0;

            const barEl = document.getElementById(`${type}-vigor-bar`);
            const textEl = document.getElementById(`${type}-vigor-text`);
            
            let barColor;
            if (percentage > 50) barColor = 'var(--color-green)';
            else if (percentage > 25) barColor = 'var(--color-accent)';
            else barColor = 'var(--color-red)';
            
            barEl.style.width = `${percentage}%`;
            barEl.style.backgroundColor = barColor;
            textEl.textContent = `${vigor} / ${maxVigor}`;
        }


        // --- LÓGICA DE DADOS (LOCAL + JSON) ---
        function saveEntity(type) {
            let id = document.getElementById(`${type}-id`).value;
            const name = document.getElementById(`${type}-name`).value.trim();
            if (!name) {
                alert("O nome é obrigatório.");
                return;
            }

            const isNewEntity = !id;
            if (isNewEntity) {
                id = `id_${Date.now()}`;
            }
            
            const dataStore = type === 'npc' ? localNpcs : localBestiary;
            const existingData = dataStore[id] || { skills: '', effects: [] };
            
            const formData = {
                name: name,
                personality: document.getElementById(`${type}-personality`).value,
                general: document.getElementById(`${type}-general`).value,
                image: document.getElementById(`${type}-image-preview`).src,
                attributes: {},
                vigor: parseInt(document.getElementById(`${type}-vigor`).value) || 0,
                maxVigor: parseInt(document.getElementById(`${type}-maxVigor`).value) || 10,
            };
            attributes.forEach(attr => {
                const attrId = attr.toLowerCase();
                formData.attributes[attrId] = parseInt(document.getElementById(`${type}-${attrId}`).value) || 0;
            });

            dataStore[id] = { ...existingData, ...formData };
            
            renderEntityList(type);
            alert(`${type.toUpperCase()} salvo na sessão atual! Lembre-se de Gravar a Campanha.`);
            
            showForm(type, id, dataStore[id]);

            setTimeout(() => {
                const card = document.querySelector(`#${type}-list .entity-card[data-id="${id}"]`);
                if(card) card.classList.add('selected');
            }, 0);
        }

        function saveNote(type) {
            let id = document.getElementById(`${type}-id`).value;
            const title = document.getElementById(`${type}-title`).value.trim();
            if (!title) {
                alert("O título é obrigatório.");
                return;
            }

            if (!id) {
                id = `id_${Date.now()}`;
            }
            
            const dataStore = type === 'evento' ? localEvents : localNotes;
            const quill = type === 'evento' ? eventQuill : noteQuill;
            
            dataStore[id] = {
                title: title,
                content: quill.root.innerHTML
            };
            
            renderNoteList(type);
            alert(`${type.charAt(0).toUpperCase() + type.slice(1)} salvo na sessão! Lembre-se de Gravar a Campanha.`);
            
            showNoteForm(type, id, dataStore[id]);

            setTimeout(() => {
                const card = document.querySelector(`#${type}-list .entity-card[data-id="${id}"]`);
                if(card) card.classList.add('selected');
            }, 0);
        }

        function deleteEntity(type) {
            const id = document.getElementById(`${type}-id`).value;
            if (!id || !confirm("Tem certeza que deseja excluir esta ficha?")) return;
            
            const dataStore = type === 'npc' ? localNpcs : localBestiary;
            delete dataStore[id];
            
            renderEntityList(type);
            document.getElementById(`${type}-form-container`).classList.add('hidden');
            activeEntity = { type: null, id: null };
            alert("Ficha excluída da sessão.");
        }

        function deleteNote(type) {
            const id = document.getElementById(`${type}-id`).value;
            if (!id || !confirm("Tem certeza que deseja excluir este item?")) return;
            
            const dataStore = type === 'evento' ? localEvents : localNotes;
            delete dataStore[id];
            
            renderNoteList(type);
            document.getElementById(`${type}-form-container`).classList.add('hidden');
            activeNote = { type: null, id: null };
            alert("Item excluído da sessão.");
        }
        
        function saveAllToJson() {
            const data = {
                npcs: localNpcs,
                bestiary: localBestiary,
                events: localEvents,
                notes: localNotes,
                gallery: localGallery,
                stickers: localStickers,
                background: currentBgImage,
                activeTheme: document.documentElement.getAttribute('data-theme') || 'cineria'
            };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "campanha.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            alert("Salvo! O arquivo 'campanha.json' foi baixado com todos os dados.");
        }

        function loadAllFromJson(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    localNpcs = data.npcs || {};
                    localBestiary = data.bestiary || {};
                    localEvents = data.events || {};
                    localNotes = data.notes || {};
                    localGallery = data.gallery || { 'default': { name: 'Geral', images: [] } };
                    localStickers = data.stickers || [];
                    
                    if (!localGallery['default']) {
                        localGallery['default'] = { name: 'Geral', images: [] };
                    }
                    activeFolderId = 'default';

                    if (data.background) {
                        setBodyBackground(data.background);
                    }

                    renderEntityList('npc');
                    renderEntityList('bestiary');
                    renderNoteList('evento');
                    renderNoteList('anotacao');
                    renderFolderList();
                    renderGallery();
                    renderStickers();
                    
                    applyTheme(data.activeTheme || 'cineria');

                    alert("Fichas carregadas com sucesso!");
                } catch (error) {
                    console.error("Erro ao carregar JSON:", error);
                    alert("Arquivo JSON inválido ou corrompido.");
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }

        // --- LÓGICA DE IMAGEM E FIGURINHAS ---
        function handleImageUpload(event, type) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('image-to-crop').src = e.target.result;
                currentCropperTarget = { type, previewElementId: `${type}-image-preview` };
                document.getElementById('cropper-modal').style.display = 'flex';
                cropper = new Cropper(document.getElementById('image-to-crop'), {
                    aspectRatio: 1, viewMode: 1, background: false, autoCropArea: 0.9, responsive: true
                });
            };
            reader.readAsDataURL(file);
        }

        function setupCropperButtons() {
            document.getElementById('crop-and-save-btn').addEventListener('click', () => {
                if (!cropper) return;
                const canvas = cropper.getCroppedCanvas({ width: 256, height: 256 });
                const newImageSrc = canvas.toDataURL();
                
                document.getElementById(currentCropperTarget.previewElementId).src = newImageSrc;
                document.getElementById(currentCropperTarget.previewElementId).classList.remove('hidden');
                document.getElementById(`${currentCropperTarget.type}-image-placeholder`).classList.add('hidden');

                document.getElementById('cropper-modal').style.display = 'none';
                cropper.destroy();
            });
            document.getElementById('cancel-crop-btn').addEventListener('click', () => {
                document.getElementById('cropper-modal').style.display = 'none';
                if(cropper) cropper.destroy();
            });
        }
        
        function dataURLtoBlob(dataurl) {
            var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
            while(n--){
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], {type:mime});
        }

        function resizeImage(file, callback) {
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
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

        // --- LÓGICA DE ROLAGEM DE DADOS ---
        function rollDice(sides, count = 1) {
            let total = 0;
            for (let i = 0; i < count; i++) {
                total += Math.floor(Math.random() * sides) + 1;
            }
            return total;
        }

        function handleCustomRoll(type) {
            const modifier = parseInt(document.getElementById('custom-roll-modifier').value) || 0;
            
            let rollResult, rollDetails;
            if (type === 'normal') {
                rollResult = rollDice(12);
                rollDetails = `1d12`;
            } else {
                rollResult = rollDice(6, 2);
                rollDetails = `2d6`;
            }

            const total = rollResult + modifier;
            const modString = modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : '';
            const message = `Mestre - Rolagem Customizada: ${total} (${rollDetails}${modString})`;

            sendMessage({ text: message, isSystem: true });
            closeCustomRollModal();
        }
        
        function handleAttributeRoll(entityName, attrName, attrValue, totalModifier, effectSources, rollType) {
            let rollResult, rollDetails;
            if (rollType === 'normal') {
                rollResult = rollDice(12);
                rollDetails = `1d12`;
            } else {
                rollResult = rollDice(6, 2);
                rollDetails = `2d6`;
            }

            const total = rollResult + attrValue + totalModifier;
            
            const attrString = attrValue !== 0 ? (attrValue > 0 ? ` + ${attrValue}` : ` - ${Math.abs(attrValue)}`) : '';
            const modifierString = totalModifier !== 0 ? (totalModifier > 0 ? ` + ${totalModifier}` : ` - ${Math.abs(totalModifier)}`) : '';
            
            const effectsString = effectSources.map(effect => 
                `<span style="color: ${effect.type === 'bonus' ? 'var(--color-green)' : 'var(--color-red)'}">${effect.name}</span>`
            ).join(' ');

            const detailsString = `(${rollDetails}${attrString}${modifierString} ${effectsString})`;

            const message = `Mestre - Teste de ${attrName} (${entityName}): ${total} ${detailsString.trim()}`;
            
            sendMessage({ text: message, isSystem: true });
            closeAttributeRollModal();
        }

        function openCustomRollModal() {
            document.getElementById('custom-roll-modal').style.display = 'flex';
        }
        function closeCustomRollModal() {
            document.getElementById('custom-roll-modal').style.display = 'none';
        }

        function openAttributeRollModal(entityName, attrName, attrValue, totalModifier, effectSources) {
            const modal = document.getElementById('attribute-roll-modal');
            modal.style.display = 'flex';
            document.getElementById('attribute-roll-modal-title').textContent = `Rolar Teste de ${attrName}?`;

            const normalBtn = document.getElementById('attribute-roll-normal-btn');
            const aptidaoBtn = document.getElementById('attribute-roll-aptidao-btn');
            const newNormalBtn = normalBtn.cloneNode(true);
            const newAptidaoBtn = aptidaoBtn.cloneNode(true);
            normalBtn.parentNode.replaceChild(newNormalBtn, normalBtn);
            aptidaoBtn.parentNode.replaceChild(newAptidaoBtn, aptidaoBtn);

            newNormalBtn.addEventListener('click', () => handleAttributeRoll(entityName, attrName, attrValue, totalModifier, effectSources, 'normal'));
            newAptidaoBtn.addEventListener('click', () => handleAttributeRoll(entityName, attrName, attrValue, totalModifier, effectSources, 'aptidao'));
        }
        function closeAttributeRollModal() {
            document.getElementById('attribute-roll-modal').style.display = 'none';
        }

        // --- JANELA DE HABILIDADES ---
        function openSkillsWindow(type) {
            const id = document.getElementById(`${type}-id`).value;
            const name = document.getElementById(`${type}-name`).value;
            if (!id) return;

            currentEditorTarget = { type, id };
            const windowEl = document.getElementById('skills-window');
            document.getElementById('skills-window-title').textContent = `Habilidades de ${name}`;
            
            const dataStore = type === 'npc' ? localNpcs : localBestiary;
            const data = dataStore[id] || { skills: '', effects: [] };

            quill.root.innerHTML = data.skills || '';
            
            populateConditionsChecklist(data.effects || []);
            updateActiveEffectsDisplay();
            
            windowEl.style.display = 'block';
        }
        
        function saveSkillsData() {
            const { type, id } = currentEditorTarget;
            if (!type || !id) return;

            const dataStore = type === 'npc' ? localNpcs : localBestiary;
            if (dataStore[id]) {
                dataStore[id].skills = quill.root.innerHTML;
                dataStore[id].effects = Array.from(document.querySelectorAll('#conditions-checklist input:checked')).map(cb => cb.dataset.condKey);
            }
        }

        function populateConditionsChecklist(currentEffects = []) {
             const checklistContainer = document.getElementById('conditions-checklist');
             checklistContainer.innerHTML = '';
             Object.keys(allConditions).sort((a,b) => allConditions[a].name.localeCompare(allConditions[b].name)).forEach(key => {
                const condition = allConditions[key];
                const isChecked = currentEffects.includes(key);
                const colorClass = condition.type === 'bonus' ? 'text-green-400' : 'text-red-400';
                checklistContainer.innerHTML += `
                    <div class="flex items-center">
                        <input id="skill-cond-${key}" type="checkbox" class="hidden custom-checkbox" data-cond-key="${key}" ${isChecked ? 'checked' : ''} onchange="updateActiveEffectsDisplay()">
                        <label for="skill-cond-${key}" class="cursor-pointer select-none transition-colors ${colorClass}">${condition.name}</label>
                    </div>`;
            });
        }
        
        function updateActiveEffectsDisplay() {
            const displayContainer = document.getElementById('active-effects-display');
            const checkedBoxes = document.querySelectorAll('#conditions-checklist input:checked');
            
            if (checkedBoxes.length === 0) {
                displayContainer.innerHTML = `<p class="italic" style="color: var(--color-text-secondary);">Nenhum efeito ativo.</p>`;
                return;
            }

            let html = '';
            checkedBoxes.forEach(checkbox => {
                const key = checkbox.dataset.condKey;
                const condition = allConditions[key];
                const colorClass = condition.type === 'bonus' ? 'text-green-400' : 'text-red-400';
                html += `<div class="${colorClass}"><strong class="font-semibold">${condition.name}:</strong> <span>${condition.description}</span></div>`;
            });
            displayContainer.innerHTML = html;
        }

        function makeWindowInteractive(windowId) {
            const win = document.getElementById(windowId);
            if (!win) return;
            const header = win.querySelector('.interactive-window-header');
            const closeBtn = win.querySelector('.interactive-window-close');
            const maxBtn = win.querySelector('.interactive-window-maximize');
            let originalPos = {};

            const dragMouseDown = (e) => {
                e.preventDefault();
                let pos3 = e.clientX;
                let pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;

                function elementDrag(e) {
                    e.preventDefault();
                    let pos1 = pos3 - e.clientX;
                    let pos2 = pos4 - e.clientY;
                    pos3 = e.clientX;
                    pos4 = e.clientY;
                    win.style.top = (win.offsetTop - pos2) + "px";
                    win.style.left = (win.offsetLeft - pos1) + "px";
                }

                function closeDragElement() {
                    document.onmouseup = null;
                    document.onmousemove = null;
                }
            };
            
            if(header) header.onmousedown = dragMouseDown;

            if(closeBtn) closeBtn.onclick = () => {
                if(windowId === 'skills-window') saveSkillsData();
                if(windowId === 'bulletin-board-window') isBulletinBoardOpen = false;
                win.style.display = 'none';
            };
            
            if(maxBtn) maxBtn.onclick = () => {
                 if (win.style.width === '100vw') {
                    win.style.width = originalPos.width;
                    win.style.height = originalPos.height;
                    win.style.top = originalPos.top;
                    win.style.left = originalPos.left;
                } else {
                    originalPos = { width: win.style.width, height: win.style.height, top: win.style.top, left: win.style.left };
                    win.style.width = '100vw';
                    win.style.height = '100vh';
                    win.style.top = '0';
                    win.style.left = '0';
                }
            };
        }
        
        // --- LÓGICA DO CHAT ---
        function playNotificationSound() {
            if (!audioCtx) {
                try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) { console.error("Web Audio API is not supported in this browser"); return; }
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
            isChatOpen = !isChatOpen;
            chatWindow.classList.toggle('hidden');
            if (isChatOpen) {
                document.getElementById('chat-notification-dot').style.display = 'none';
                bringToFront(chatWindow);
            }
        }

        async function sendMessage(messageData) {
            if (!appInitialized) {
                alert("O Firebase não está conectado.");
                return;
            }
            const text = messageData.text.trim();
            if (text === '') return;

            const senderName = 'Mestre';
            const avatar = 'https://placehold.co/40x40/d4a373/1a1a1a?text=GM';

            try {
                await messagesCollection.add({
                    text: text,
                    sender: senderName,
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
            if (!appInitialized) return;
            const messagesContainer = document.getElementById('chat-messages');
            const senderName = 'Mestre';
            
            messagesCollection.orderBy('timestamp', 'asc').onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const msg = change.doc.data();
                        if (!msg.text) return;

                        if (msg.sender !== senderName && !isChatOpen) {
                            document.getElementById('chat-notification-dot').style.display = 'block';
                            playNotificationSound();
                        }
                        
                        const msgElement = document.createElement('div');
                        
                        if (msg.isSystem) {
                             msgElement.className = 'chat-message-system';
                             msgElement.innerHTML = `<span>${msg.text}</span>`;
                        } else if (msg.isPrivate) {
                            if (msg.sender === senderName) {
                                msgElement.className = 'chat-message chat-message-own chat-message-private';
                                msgElement.innerHTML = `<img src="${msg.avatar}" class="chat-avatar" alt="Avatar"><div class="chat-message-content"><span class="sender">Sussurro para ${msg.recipient}</span><span>${msg.text}</span></div>`;
                            } else {
                                msgElement.className = 'chat-message chat-message-other chat-message-private';
                                msgElement.innerHTML = `<img src="${msg.avatar}" class="chat-avatar" alt="Avatar"><div class="chat-message-content"><span class="sender">${msg.sender} sussurra para ${msg.recipient}</span><span>${msg.text}</span></div>`;
                            }
                        } else {
                            const isOwnMessage = msg.sender === senderName;
                            msgElement.className = `chat-message ${isOwnMessage ? 'chat-message-own' : 'chat-message-other'}`;
                            msgElement.innerHTML = `<img src="${msg.avatar || 'https://placehold.co/40x40/222222/888888?text=?'}" class="chat-avatar" alt="Avatar"><div class="chat-message-content"><span class="sender">${msg.sender}</span><span>${msg.text}</span></div>`;
                        }
                        messagesContainer.appendChild(msgElement);
                    }
                });
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, error => {
                console.error("Erro ao ouvir mensagens: ", error);
                // Não alerta o usuário aqui, pode ser um problema temporário de permissão
            });
        }

        function openClearChatModal() {
            document.getElementById('clear-chat-modal').style.display = 'flex';
        }
        function closeClearChatModal() {
            document.getElementById('clear-chat-modal').style.display = 'none';
        }

        async function clearAllChatMessages() {
            if (!appInitialized) {
                alert("O Firebase não está conectado.");
                return;
            }
            if(!confirm("Tem certeza que deseja apagar o chat PARA TODOS? Esta ação é permanente.")) return;
            try {
                const querySnapshot = await messagesCollection.get();
                if (querySnapshot.empty) {
                    closeClearChatModal();
                    return;
                }
                const batch = db.batch();
                querySnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            } catch (error) {
                console.error("Erro ao limpar o chat para todos: ", error);
                alert("Ocorreu um erro ao tentar limpar o chat.");
            } finally {
                closeClearChatModal();
            }
        }
        
        // --- FUNÇÕES ANTIGAS DO PAINEL LATERAL REMOVIDAS ---
        // (toggleGmPanel, listenForOnlinePlayers, gmUpdatePlayerVigor, openConditionModal, etc.)
        // Agora o botão apenas abre o dm.html em nova aba via HTML onclick.

        // --- GALERIA FUNÇÕES ---
        function renderFolderList() {
            const listEl = document.getElementById('gallery-folders-list');
            listEl.innerHTML = '';
            Object.keys(localGallery).forEach(folderId => {
                const folder = localGallery[folderId];
                const folderEl = document.createElement('div');
                folderEl.className = `folder-item ${folderId === activeFolderId ? 'active' : ''}`;
                folderEl.textContent = folder.name;
                folderEl.dataset.id = folderId;
                folderEl.onclick = () => switchFolder(folderId);
                folderEl.oncontextmenu = (e) => openGalleryContextMenu(e, 'folder', folderId);
                listEl.appendChild(folderEl);
            });
        }
        function switchFolder(folderId) {
            activeFolderId = folderId;
            renderFolderList();
            renderGallery();
        }
        function openFolderModal(mode, folderId = null) {
            const modal = document.getElementById('folder-modal');
            const title = document.getElementById('folder-modal-title');
            const input = document.getElementById('folder-name-input');
            document.getElementById('folder-modal-mode').value = mode;
            document.getElementById('folder-modal-id').value = folderId || '';

            if (mode === 'add') {
                title.textContent = 'Nova Pasta';
                input.value = '';
                input.placeholder = 'Nome da pasta...';
            } else {
                title.textContent = 'Renomear Pasta';
                input.value = localGallery[folderId].name;
            }
            modal.style.display = 'flex';
        }
        function handleSaveFolder() {
            const mode = document.getElementById('folder-modal-mode').value;
            const folderId = document.getElementById('folder-modal-id').value;
            const name = document.getElementById('folder-name-input').value.trim();
            if (!name) {
                alert('O nome da pasta não pode estar vazio.');
                return;
            }
            if (mode === 'add') {
                const newId = `folder_${Date.now()}`;
                localGallery[newId] = { name: name, images: [] };
            } else {
                localGallery[folderId].name = name;
            }
            renderFolderList();
            document.getElementById('folder-modal').style.display = 'none';
        }
        function deleteFolder(folderId) {
             if (folderId === 'default') {
                alert('Não é possível apagar a pasta padrão.');
                return;
            }
            if (confirm(`Tem certeza que deseja apagar a pasta "${localGallery[folderId].name}" e todas as suas imagens?`)) {
                delete localGallery[folderId];
                if (activeFolderId === folderId) {
                    activeFolderId = 'default';
                }
                renderFolderList();
                renderGallery();
            }
        }
        function renderGallery() {
            document.getElementById('gallery-current-folder-name').textContent = localGallery[activeFolderId]?.name || 'Galeria';
            const galleryContent = document.getElementById('gallery-images-container');
            galleryContent.innerHTML = '';
            const images = localGallery[activeFolderId]?.images || [];
            if (images.length === 0) {
                galleryContent.innerHTML = '<p class="col-span-full text-center mt-8" style="color: var(--color-text-secondary);">Nenhuma imagem nesta pasta.</p>';
                return;
            }
            images.forEach(imgData => {
                const thumb = document.createElement('div');
                thumb.className = 'gallery-thumbnail';
                thumb.id = imgData.id;
                thumb.oncontextmenu = (e) => openGalleryContextMenu(e, 'image', imgData.id);
                thumb.innerHTML = `
                    <img src="${imgData.src}" alt="${imgData.caption}" onclick="openLightbox('${imgData.src}')">
                    <input type="text" class="gallery-thumbnail-caption" value="${imgData.caption}" onchange="updateGalleryCaption('${imgData.id}', this.value)" placeholder="Legenda...">
                `;
                galleryContent.appendChild(thumb);
            });
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
        function handleGalleryUrlAdd() {
            document.getElementById('gallery-url-input').value = '';
            document.getElementById('gallery-url-modal').style.display = 'flex';
        }
        function submitUrlModal() {
            const url = document.getElementById('gallery-url-input').value;
            if (url) {
                addImageToGallery({ src: url, caption: 'Imagem da Web' });
            }
            document.getElementById('gallery-url-modal').style.display = 'none';
        }
        function addImageToGallery(imageData) {
            if (!localGallery[activeFolderId]) return;
            const newImage = {
                id: `gallery-img-${Date.now()}-${Math.random()}`,
                src: imageData.src,
                caption: imageData.caption || '',
            };
            localGallery[activeFolderId].images.push(newImage);
            renderGallery();
        }
        function updateGalleryCaption(id, newCaption) {
            for (const folderId in localGallery) {
                const image = localGallery[folderId].images.find(img => img.id === id);
                if (image) {
                    image.caption = newCaption;
                    break;
                }
            }
        }
        function removeImageFromGallery(id) {
            if (!confirm('Tem certeza que deseja remover esta imagem?')) return;
            for (const folderId in localGallery) {
                localGallery[folderId].images = localGallery[folderId].images.filter(img => img.id !== id);
            }
            renderGallery();
        }
        function openLightbox(imageUrl) {
            document.getElementById('lightbox-image').src = imageUrl;
            document.getElementById('gallery-lightbox').style.display = 'flex';
        }
        function closeLightbox(event) {
            if (event.target.id === 'gallery-lightbox' || event.target.tagName === 'BUTTON') {
                document.getElementById('gallery-lightbox').style.display = 'none';
            }
        }
        function setBodyBackground(src) {
            if (src) {
                document.body.style.setProperty('--bg-image', `url('${src}')`);
                document.body.classList.add('body-background-image');
                currentBgImage = src;
            } else { // Para remover o fundo
                document.body.style.removeProperty('--bg-image');
                document.body.classList.remove('body-background-image');
                currentBgImage = '';
            }
        }
        function findImageById(id) {
             for (const folderId in localGallery) {
                const image = localGallery[folderId].images.find(img => img.id === id);
                if (image) return image;
            }
            return null;
        }
        function openGalleryContextMenu(e, type, id) {
            e.preventDefault();
            const menu = document.getElementById('gallery-context-menu');
            menu.innerHTML = ''; // Limpa o menu
            if (type === 'folder') {
                menu.innerHTML = `
                    <button onclick="openFolderModal('rename', '${id}')">Renomear</button>
                    <button class="text-red-400" onclick="deleteFolder('${id}')">Excluir</button>
                `;
            } else if (type === 'image') {
                const image = findImageById(id);
                if (!image) return;
                menu.innerHTML = `
                    <button onclick="setBodyBackground('${image.src}')">Definir como Fundo</button>
                    <button onclick="setBodyBackground('')">Remover Fundo</button>
                    <hr class="my-1" style="border-top-color: var(--color-border);">
                    <button class="text-red-400" onclick="removeImageFromGallery('${id}')">Excluir Imagem</button>`;
            }
            menu.style.display = 'block';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
            const clickOutsideHandler = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', clickOutsideHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', clickOutsideHandler), 0);
        }
        
        // --- FIGURINHAS FUNÇÕES ---
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
            const newSticker = { id: `sticker-${Date.now()}-${Math.random()}`, src: stickerData.src };
            localStickers.push(newSticker);
            renderStickers();
        }
        function renderStickers() {
            const stickersContent = document.getElementById('stickers-content');
            stickersContent.innerHTML = '';
             if (localStickers.length === 0) {
                stickersContent.innerHTML = '<p class="col-span-full text-center mt-8" style="color: var(--color-text-secondary);">Nenhuma figurinha carregada.</p>';
                return;
            }
            localStickers.forEach(stickerData => {
                const thumb = document.createElement('div');
                thumb.className = 'sticker-thumbnail';
                thumb.id = stickerData.id;
                thumb.oncontextmenu = (e) => {
                    e.preventDefault();
                    if(confirm('Remover esta figurinha?')){
                        localStickers = localStickers.filter(s => s.id !== stickerData.id);
                        renderStickers();
                    }
                };
                thumb.innerHTML = `
                    <img src="${stickerData.src}" alt="Figurinha" onclick="openLightbox('${stickerData.src}')">
                    <button class="btn btn-primary sticker-send-btn" onclick="sendStickerToChat('${stickerData.src}')">Enviar</button>
                `;
                stickersContent.appendChild(thumb);
            });
        }
        function sendStickerToChat(imageUrl) {
            const messageText = `<img src="${imageUrl}" alt="Figurinha">`;
            sendMessage({ text: messageText });
        }

        // --- SISTEMA DE TEMAS ---
        function applyTheme(themeName) {
            document.documentElement.setAttribute('data-theme', themeName);
            localStorage.setItem('gmPanelTheme', themeName);
            // Atualiza o seletor para refletir a mudança
            const selector = document.getElementById('theme-selector');
            if (selector) selector.value = themeName;
        }

        function setupThemeSelector() {
            const selector = document.getElementById('theme-selector');
            for (const themeId in defaultThemes) {
                const option = document.createElement('option');
                option.value = themeId;
                option.textContent = defaultThemes[themeId].name;
                selector.appendChild(option);
            }
            selector.addEventListener('change', (e) => applyTheme(e.target.value));
        }

        // --- QUADRO DE AVISOS ---
        function toggleBulletinBoard() {
            const windowEl = document.getElementById('bulletin-board-window');
            isBulletinBoardOpen = !isBulletinBoardOpen;
            if (isBulletinBoardOpen) {
                windowEl.style.display = 'flex';
                bringToFront(windowEl);
            } else {
                windowEl.style.display = 'none';
            }
        }
        
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

        async function sendBulletinMessage() {
            if (!appInitialized) {
                alert("O Firebase não está conectado.");
                return;
            }
            const textInput = document.getElementById('bulletin-board-input');
            const fileInput = document.getElementById('bulletin-image-upload');
            const sendBtn = document.getElementById('bulletin-send-btn');
            
            const text = textInput.value.trim();
            const file = fileInput.files[0];

            if (text === '' && !file) {
                return; 
            }

            sendBtn.disabled = true;
            sendBtn.textContent = 'Enviando...';

            let imageUrl = null;
            let storagePath = null;

            try {
                if (file) {
                    const resizedDataUrl = await new Promise(resolve => resizeImage(file, resolve));
                    const resizedImageBlob = dataURLtoBlob(resizedDataUrl);

                    const filePath = `bulletin_board_images/${Date.now()}_${file.name}`;
                    const fileRef = storage.ref(filePath);
                    const snapshot = await fileRef.put(resizedImageBlob);
                    imageUrl = await snapshot.ref.getDownloadURL();
                    storagePath = filePath;
                }

                await bulletinBoardCollection.add({
                    text: text,
                    imageUrl: imageUrl,
                    storagePath: storagePath,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                textInput.value = '';
                fileInput.value = '';

            } catch (error) {
                console.error("Erro ao enviar aviso:", error);
                alert("Não foi possível enviar o aviso.");
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Enviar';
            }
        }
        
        function listenForBulletinMessages() {
            if (!appInitialized) return;
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

                    messagesContainer.appendChild(msgElement);
                });
            }, error => {
                console.error("Erro ao ouvir avisos: ", error);
            });
        }

        async function showBulletinToPlayers() {
            if (!appInitialized) {
                alert("O Firebase não está conectado.");
                return;
            }
            try {
                await bulletinStateRef.set({
                    last_shown: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                playBulletinSound();
                alert("Aviso enviado para os jogadores!");

            } catch (error) {
                console.error("Erro ao notificar jogadores:", error);
                alert("Não foi possível notificar os jogadores.");
            }
        }

        function openClearBulletinModal() {
            document.getElementById('clear-bulletin-modal').style.display = 'flex';
            bringToFront(document.getElementById('clear-bulletin-modal'));
        }
        function closeClearBulletinModal() {
            document.getElementById('clear-bulletin-modal').style.display = 'none';
        }

        async function clearAllBulletinMessages() {
            if (!appInitialized) {
                alert("O Firebase não está conectado.");
                return;
            }
            if (!confirm("Tem certeza que deseja apagar PERMANENTEMENTE todos os avisos e imagens do quadro?")) return;
            
            const btn = document.getElementById('clear-bulletin-confirm-btn');
            btn.disabled = true;
            btn.textContent = 'Limpando...';

            try {
                const querySnapshot = await bulletinBoardCollection.get();
                if (querySnapshot.empty) {
                    closeClearBulletinModal();
                    return;
                }

                const batch = db.batch();
                const deletePromises = [];

                querySnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.storagePath) {
                        const fileRef = storage.ref(data.storagePath);
                        deletePromises.push(fileRef.delete().catch(err => {
                            if (err.code !== 'storage/object-not-found') {
                                console.error("Erro ao deletar imagem do storage:", data.storagePath, err);
                            }
                        }));
                    }
                    batch.delete(doc.ref);
                });

                await Promise.all(deletePromises);
                await batch.commit();

            } catch (error) {
                console.error("Erro ao limpar o quadro de avisos:", error);
                alert("Ocorreu um erro ao tentar limpar o quadro de avisos.");
            } finally {
                btn.disabled = false;
                btn.textContent = 'Limpar Tudo';
                closeClearBulletinModal();
            }
        }


        function bringToFront(element) {
             highestZIndex++;
             element.style.zIndex = highestZIndex;
        }

        function makeWindowDraggable(win, handle) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            handle.onmousedown = dragMouseDown;
            function dragMouseDown(e) {
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }
            function elementDrag(e) {
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

        // --- INICIALIZAÇÃO ---
        document.addEventListener('DOMContentLoaded', () => {
            // Setup do Seletor de Tema
            setupThemeSelector();
            const savedTheme = localStorage.getItem('gmPanelTheme') || 'cineria';
            applyTheme(savedTheme);

            createEntityInterface('npc');
            createEntityInterface('bestiary');
            createNoteInterface('evento');
            createNoteInterface('anotacao');
            renderEntityList('npc');
            renderEntityList('bestiary');
            renderNoteList('evento');
            renderNoteList('anotacao');
            setupCropperButtons();
            
            quill = new Quill('#quill-editor', { theme: 'snow' });
            eventQuill = new Quill('#evento-editor-container', { theme: 'snow', modules: { toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], [{ 'header': [1, 2, false] }], ['clean']] } });
            noteQuill = new Quill('#anotacao-editor-container', { theme: 'snow', modules: { toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], [{ 'header': [1, 2, false] }], ['clean']] } });
            
            makeWindowInteractive('skills-window');
            makeWindowInteractive('bulletin-board-window');

            // Setup do Chat
            document.getElementById('chat-toggle-button').addEventListener('click', toggleChat);
            document.getElementById('chat-send-btn').addEventListener('click', () => sendMessage({ text: document.getElementById('chat-input').value }));
            document.getElementById('chat-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMessage({ text: e.target.value });
            });
            // listenForMessages(); // Movido para dentro de initializeFirebase
            makeWindowDraggable(document.getElementById('chat-window'), document.getElementById('chat-header'));
            document.getElementById('open-clear-chat-btn').addEventListener('click', openClearChatModal);
            document.getElementById('clear-chat-cancel-btn').addEventListener('click', closeClearChatModal);
            document.getElementById('clear-chat-modal').addEventListener('click', (e) => { if (e.target.id === 'clear-chat-modal') closeClearChatModal(); });
            document.getElementById('clear-chat-local-btn').addEventListener('click', () => {
                document.getElementById('chat-messages').innerHTML = '';
                closeClearChatModal();
            });
            document.getElementById('clear-chat-all-btn').addEventListener('click', clearAllChatMessages);

            // Setup do Quadro de Avisos
            document.getElementById('bulletin-board-toggle-button').addEventListener('click', toggleBulletinBoard);
            document.getElementById('bulletin-send-btn').addEventListener('click', sendBulletinMessage);
            document.getElementById('bulletin-board-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    sendBulletinMessage();
                }
            });
            document.getElementById('show-bulletin-btn').addEventListener('click', showBulletinToPlayers);
            // listenForBulletinMessages(); // Movido
            document.getElementById('open-clear-bulletin-btn').addEventListener('click', openClearBulletinModal);
            document.getElementById('clear-bulletin-confirm-btn').addEventListener('click', clearAllBulletinMessages);
            document.getElementById('clear-bulletin-cancel-btn').addEventListener('click', closeClearBulletinModal);
            document.getElementById('clear-bulletin-modal').addEventListener('click', (e) => { if (e.target.id === 'clear-bulletin-modal') closeClearBulletinModal(); });


            // Setup Rolagens
            document.getElementById('custom-roll-btn').addEventListener('click', openCustomRollModal);
            document.getElementById('custom-roll-modal').addEventListener('click', (e) => { if (e.target.id === 'custom-roll-modal') closeCustomRollModal(); });
            document.getElementById('custom-roll-normal-btn').addEventListener('click', () => handleCustomRoll('normal'));
            document.getElementById('custom-roll-aptidao-btn').addEventListener('click', () => handleCustomRoll('aptidao'));
            document.getElementById('attribute-roll-modal').addEventListener('click', (e) => { if (e.target.id === 'attribute-roll-modal') closeAttributeRollModal(); });
            
            // REMOVIDO: Setup do botão antigo 'gm-panel-button'
            // O botão agora é gerido diretamente pelo onclick no HTML para abrir dm.html

            // Setup Galeria
            renderFolderList();
            renderGallery();

            // --- NOVO: Listeners dos botões de Config ---
            document.getElementById('config-button').addEventListener('click', openConfigModal);
            document.getElementById('config-modal').addEventListener('click', (e) => { if (e.target.id === 'config-modal') closeConfigModal(); });
            document.getElementById('load-key-input').addEventListener('change', loadTableKey);


            // --- NOVO: Inicia a checagem do Firebase ---
            checkFirebaseConfig();
        });