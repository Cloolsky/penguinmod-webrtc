(function(Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        alert('Расширение должно работать в несэндбоксовом режиме для доступа к микрофону!');
    }

    class CloudLinkWebRTC {
        constructor() {
            this.ws = null;
            this.peerConnection = null;
            this.localStream = null;
            this.remoteStream = null;
            this.targetUser = null; // Кому звоним / от кого ждем звонок
            
            this.rtcConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            };
        }

        getInfo() {
            return {
                id: 'cloudlinkwebrtc',
                name: 'CloudLink WebRTC Voice',
                color1: '#4CAF50',
                color2: '#388E3C',
                blocks: [
                    {
                        opcode: 'connectCloudlink',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'подключиться к CloudLink серверу [URL]',
                        arguments: {
                            URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'wss://cloudlink.awix.gay/ws' }
                        }
                    },
                    {
                        opcode: 'callUser',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'позвонить игроку [USER]',
                        arguments: {
                            USER: { type: Scratch.ArgumentType.STRING, defaultValue: 'Player2' }
                        }
                    },
                    {
                        opcode: 'muteMic',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'микрофон вкл [STATE]',
                        arguments: {
                            STATE: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu', defaultValue: 'да' }
                        }
                    }
                ],
                menus: {
                    boolMenu: { items: ['да', 'нет'] }
                }
            };
        }

        connectCloudlink(args) {
            this.ws = new WebSocket(args.URL);

            this.ws.onopen = () => {
                console.log('CloudLink подключен, используем как сигнальный сервер');
                // Стандартная инициализация в CloudLink (установка ID, если требуется)
                this.ws.send(JSON.stringify({ val: "ID", id: "WebRTCUser_" + Math.floor(Math.random()*1000) }));
            };

            this.ws.onmessage = async (event) => {
                let packet;
                try {
                    packet = JSON.parse(event.data);
                } catch (e) {
                    return;
                }

                // Обработка кастомных сигнальных сообщений WebRTC через CloudLink
                if (packet.cmd === "direct" && packet.val) {
                    let signalData = packet.val;

                    if (signalData.type === 'offer') {
                        await this.handleOffer(signalData.offer, packet.id);
                    } else if (signalData.type === 'answer') {
                        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.answer));
                    } else if (signalData.type === 'candidate') {
                        if (this.peerConnection) {
                            await this.peerConnection.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                        }
                    }
                }
            };
        }

        async initMedia() {
            if (!this.localStream) {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
        }

        createPeerConnection(remoteId) {
            this.targetUser = remoteId;
            this.peerConnection = new RTCPeerConnection(this.rtcConfig);

            // Добавляем дорожки микрофона
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Получение аудио от собеседника
            this.peerConnection.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                const audio = document.createElement('audio');
                audio.srcObject = this.remoteStream;
                audio.autoplay = true;
                document.body.appendChild(audio);
            };

            // Отправка ICE-кандидатов через CloudLink
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignal(this.targetUser, { type: 'candidate', candidate: event.candidate });
                }
            };
        }

        async callUser(args) {
            await this.initMedia();
            this.createPeerConnection(args.USER);

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.sendSignal(this.targetUser, { type: 'offer', offer: offer });
        }

        async handleOffer(offer, senderId) {
            await this.initMedia();
            this.createPeerConnection(senderId);

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.sendSignal(senderId, { type: 'answer', answer: answer });
        }

        sendSignal(target, data) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Отправка личного сообщения через CloudLink
                this.ws.send(JSON.stringify({
                    cmd: "pmsg",
                    val: data,
                    id: target
                }));
            }
        }

        muteMic(args) {
            if (this.localStream) {
                const enable = args.STATE === 'да';
                this.localStream.getAudioTracks().forEach(track => {
                    track.enabled = enable;
                });
            }
        }
    }

    Scratch.extensions.register(new CloudLinkWebRTC());
})(Scratch);
