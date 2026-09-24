(function(Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        alert('Расширение должно работать в несэндбоксовом режиме для доступа к микрофону!');
    }

    class CloudLinkWebRTCPrimitive {
        constructor() {
            this.ws = null;
            this.peerConnection = null;
            this.localStream = null;
            this.remoteStream = null;
            
            // Последние сгенерированные данные для чтения через репортеры
            this.lastLocalOffer = '';
            this.lastLocalAnswer = '';
            this.lastLocalCandidate = '';

            this.rtcConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            };
        }

        getInfo() {
            return {
                id: 'cloudlinkwebrtcprimitive',
                name: 'WebRTC & CloudLink Primitives',
                color1: '#3F51B5',
                color2: '#303F9F',
                blocks: [
                    // CloudLink связь
                    {
                        opcode: 'connectCloudlink',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'подключиться к CloudLink [URL]',
                        arguments: {
                            URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'wss://cloudlink.awix.gay/ws' }
                        }
                    },
                    {
                        opcode: 'sendCloudlinkMessage',
                        blockType:Scratch.BlockType.COMMAND,
                        text: 'отправить игроку [ID] сообщение [DATA]',
                        arguments: {
                            ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'Player2' },
                            DATA: { type: Scratch.ArgumentType.STRING, defaultValue: 'hello' }
                        }
                    },
                    {
                        opcode: 'whenMessageReceived',
                        blockType: Scratch.BlockType.EVENT,
                        text: 'когда получено сообщение CloudLink'
                    },
                    {
                        opcode: 'getLastMessage',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'последнее сообщение CloudLink'
                    },
                    {
                        opcode: 'getLastSender',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'отправитель последнего сообщения'
                    },

                    '---',

                    // WebRTC Primitives
                    {
                        opcode: 'initLocalAudio',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'включить локальный микрофон'
                    },
                    {
                        opcode: 'createPeerConnection',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'создать RTCPeerConnection'
                    },
                    {
                        opcode: 'createOffer',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'создать WebRTC Offer'
                    },
                    {
                        opcode: 'createAnswer',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'создать WebRTC Answer для offer [OFFER]',
                        arguments: {
                            OFFER: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
                        }
                    },
                    {
                        opcode: 'setRemoteDescription',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'установить remote description [TYPE] из [SDP]',
                        arguments: {
                            TYPE: { type: Scratch.ArgumentType.STRING, menu: 'sdpTypeMenu', defaultValue: 'offer' },
                            SDP: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
                        }
                    },
                    {
                        opcode: 'addIceCandidate',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'добавить ICE кандидата [CANDIDATE]',
                        arguments: {
                            CANDIDATE: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
                        }
                    },

                    '---',

                    // Репортеры данных WebRTC
                    {
                        opcode: 'getLocalOffer',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'созданный Offer (текст)'
                    },
                    {
                        opcode: 'getLocalAnswer',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'созданный Answer (текст)'
                    },
                    {
                        opcode: 'getLocalCandidate',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'последний ICE кандидат (текст)'
                    },

                    // Управление звуком
                    {
                        opcode: 'setMuted',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'микрофон включен [STATE]',
                        arguments: {
                            STATE: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu', defaultValue: 'да' }
                        }
                    }
                ],
                menus: {
                    boolMenu: { items: ['да', 'нет'] },
                    sdpTypeMenu: { items: ['offer', 'answer'] }
                }
            };
        }

        // --- CloudLink логика ---
        connectCloudlink(args) {
            if (this.ws) {
                this.ws.close();
            }
            this.ws = new WebSocket(args.URL);
            this.lastMessage = '';
            this.lastSender = '';

            this.ws.onmessage = (event) => {
                try {
                    const packet = JSON.parse(event.data);
                    // Обработка стандартных приватных сообщений CloudLink
                    if (packet.cmd === "pmsg") {
                        this.lastMessage = typeof packet.val === 'object' ? JSON.stringify(packet.val) : packet.val;
                        this.lastSender = packet.id || '';
                        Scratch.vm.runtime.startHats('cloudlinkwebrtcprimitive_whenMessageReceived');
                    }
                } catch (e) {
                    // Если пришел не JSON, а просто текст
                    this.lastMessage = event.data;
                    this.lastSender = '';
                    Scratch.vm.runtime.startHats('cloudlinkwebrtcprimitive_whenMessageReceived');
                }
            };
        }

        sendCloudlinkMessage(args) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                let valToSend = args.DATA;
                try {
                    valToSend = JSON.parse(args.DATA); // Если передали JSON-строку
                } catch (e) {}

                this.ws.send(JSON.stringify({
                    cmd: "pmsg",
                    val: valToSend,
                    id: args.ID
                }));
            }
        }

        whenMessageReceived() { return true; }
        getLastMessage() { return this.lastMessage; }
        getLastSender() { return this.lastSender; }

        // --- WebRTC Primitives ---
        async initLocalAudio() {
            if (!this.localStream) {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
        }

        createPeerConnection() {
            if (this.peerConnection) {
                this.peerConnection.close();
            }

            this.peerConnection = new RTCPeerConnection(this.rtcConfig);

            // Добавляем локальные треки микрофона, если они уже есть
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }

            // Перехват удаленного звука (собеседника)
            this.peerConnection.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                const audio = document.createElement('audio');
                audio.srcObject = this.remoteStream;
                audio.autoplay = true;
                document.body.appendChild(audio);
            };

            // Перехват ICE кандидатов
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.lastLocalCandidate = JSON.stringify(event.candidate);
                }
            };
        }

        async createOffer() {
            if (!this.peerConnection) return;
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.lastLocalOffer = JSON.stringify(offer);
        }

        async createAnswer(args) {
            if (!this.peerConnection) return;
            let offerObj;
            try {
                offerObj = JSON.parse(args.OFFER);
            } catch (e) {
                offerObj = args.OFFER;
            }

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerObj));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.lastLocalAnswer = JSON.stringify(answer);
        }

        async setRemoteDescription(args) {
            if (!this.peerConnection) return;
            let sdpObj;
            try {
                sdpObj = JSON.parse(args.SDP);
            } catch (e) {
                sdpObj = args.SDP;
            }

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription({
                type: args.TYPE,
                sdp: sdpObj.sdp || sdpObj
            }));
        }

        async addIceCandidate(args) {
            if (!this.peerConnection) return;
            let candObj;
            try {
                candObj = JSON.parse(args.CANDIDATE);
            } catch (e) {
                return;
            }
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candObj));
        }

        getLocalOffer() { return this.lastLocalOffer; }
        getLocalAnswer() { return this.lastLocalAnswer; }
        getLocalCandidate() { return this.lastLocalCandidate; }

        setMuted(args) {
            if (this.localStream) {
                const enable = args.STATE === 'да';
                this.localStream.getAudioTracks().forEach(track => {
                    track.enabled = enable;
                });
            }
        }
    }

    Scratch.extensions.register(new CloudLinkWebRTCPrimitive());
})(Scratch);
