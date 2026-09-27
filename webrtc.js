(function(Scratch) {
    'use strict';

    class PureWebRTCExtension {
        constructor() {
            this.peerConnections = {};
            this.localStream = null;
            this.remoteStreams = {};
            this.pendingIce = {};
            this.iceQueue = [];
            this.lastOffer = '';
            this.lastAnswer = '';
            this.containers = {};
            this.audioElements = {};
        }

        ensureLocalStream() {
            if (!this.localStream) {
                this.localStream = new MediaStream();
            }
        }

        getInfo() {
            return {
                id: 'purewebrtcchat',
                name: 'Pure WebRTC Call',
                color1: '#2575fc',
                color2: '#6a11cb',

                blocks: [
                    {
                        opcode: 'setAudioDevice',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'микрофон [STATE]',
                        arguments: {
                            STATE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'boolMenu',
                                defaultValue: 'включить'
                            }
                        }
                    },
                    {
                        opcode: 'setVideoDevice',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'камера [STATE]',
                        arguments: {
                            STATE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'boolMenu',
                                defaultValue: 'включить'
                            }
                        }
                    },
                    {
                        opcode: 'createConnection',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'создать соединение для [ID]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'player2'
                            }
                        }
                    },
                    {
                        opcode: 'closeConnection',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'закрыть соединение для [ID]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'player2'
                            }
                        }
                    },
                    {
                        opcode: 'createOffer',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'создать offer для [ID]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'player2'
                            }
                        }
                    },
                    {
                        opcode: 'getOfferText',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'созданный Offer (текст)'
                    },
                    {
                        opcode: 'setRemoteOffer',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'установить remote offer для [ID] из [TEXT]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'player1'
                            },
                            TEXT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'текст'
                            }
                        }
                    },
                    {
                        opcode: 'createAnswer',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'создать answer для [ID] из offer [TEXT]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'player1'
                            },
                            TEXT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'текст'
                            }
                        }
                    },
                    {
                        opcode: 'getAnswerText',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'созданный Answer (текст)'
                    },
                    {
                        opcode: 'setRemoteAnswer',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'установить remote answer для [ID] из [TEXT]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'player2'
                            },
                            TEXT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'текст'
                            }
                        }
                    },
                    {
                        opcode: 'getIceText',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'текущий ICE кандидат'
                    },
                    {
                        opcode: 'hasNewIceCandidate',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'есть ли новый ICE кандидат?'
                    },
                    {
                        opcode: 'addIceCandidate',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'добавить ICE кандидата для [ID] из [TEXT]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'partner'
                            },
                            TEXT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'кандидат'
                            }
                        }
                    },
                    {
                        opcode: 'createVideoWindow',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'создать видео окно для [ID] (тип: [TYPE])',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'player2'
                            },
                            TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'videoTypeMenu',
                                defaultValue: 'собеседник'
                            }
                        }
                    }
                ],

                menus: {
                    boolMenu: {
                        acceptReporters: false,
                        items: ['включить', 'выключить']
                    },
                    videoTypeMenu: {
                        acceptReporters: false,
                        items: ['собеседник', 'я сам']
                    }
                }
            };
        }

        async setAudioDevice(args) {
            this.ensureLocalStream();

            const turnOn = String(args.STATE) === 'включить';

            try {
                const oldTracks = this.localStream.getAudioTracks();

                for (const track of oldTracks) {
                    track.stop();
                    this.localStream.removeTrack(track);
                }

                if (!turnOn) {
                    await this.updateAllPeerTracks('audio', null);
                    return;
                }

                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error('getUserMedia недоступен');
                }

                const tempStream = await navigator.mediaDevices.getUserMedia({
                    audio: true
                });

                const track = tempStream.getAudioTracks()[0];

                if (!track) {
                    throw new Error('Микрофон не вернул аудиотрек');
                }

                this.localStream.addTrack(track);
                await this.updateAllPeerTracks('audio', track);
            } catch (err) {
                console.error('Ошибка микрофона:', err);
            }
        }

        async setVideoDevice(args) {
            this.ensureLocalStream();

            const turnOn = String(args.STATE) === 'включить';

            try {
                const oldTracks = this.localStream.getVideoTracks();

                for (const track of oldTracks) {
                    track.stop();
                    this.localStream.removeTrack(track);
                }

                if (!turnOn) {
                    await this.updateAllPeerTracks('video', null);
                    this.refreshLocalWindows();
                    return;
                }

                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error('getUserMedia недоступен');
                }

                const tempStream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });

                const track = tempStream.getVideoTracks()[0];

                if (!track) {
                    throw new Error('Камера не вернула видеотрек');
                }

                this.localStream.addTrack(track);
                await this.updateAllPeerTracks('video', track);
                this.refreshLocalWindows();
            } catch (err) {
                console.error('Ошибка камеры:', err);
            }
        }

        async updateAllPeerTracks(kind, newTrack) {
            for (const id in this.peerConnections) {
                const pc = this.peerConnections[id];

                try {
                    const transceiver = pc.getTransceivers().find(
                        t =>
                            t.receiver &&
                            t.receiver.track &&
                            t.receiver.track.kind === kind
                    );

                    if (transceiver && transceiver.sender) {
                        await transceiver.sender.replaceTrack(newTrack || null);
                    }
                } catch (err) {
                    console.error(
                        `Ошибка замены ${kind}-трека для ${id}:`,
                        err
                    );
                }
            }
        }

        refreshLocalWindows() {
            this.ensureLocalStream();

            for (const id in this.containers) {
                const video = this.containers[id].querySelector('video');

                if (video && video.dataset.type === 'я сам') {
                    video.srcObject = this.localStream;

                    const result = video.play();
                    if (result && typeof result.catch === 'function') {
                        result.catch(() => {});
                    }
                }
            }
        }

        createConnection(args) {
            this.ensureLocalStream();

            const id = String(args.ID || '').trim();

            if (!id) {
                return;
            }

            if (!window.RTCPeerConnection) {
                console.error('RTCPeerConnection недоступен');
                return;
            }

            if (this.peerConnections[id]) {
                this.closeConnection({ ID: id });
            }

            this.pendingIce[id] = [];

            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            this.peerConnections[id] = pc;

            pc.addTransceiver('audio', {
                direction: 'sendrecv'
            });

            pc.addTransceiver('video', {
                direction: 'sendrecv'
            });

            const audioTrack = this.localStream.getAudioTracks()[0];
            const videoTrack = this.localStream.getVideoTracks()[0];

            const audioTransceiver = pc.getTransceivers().find(
                t =>
                    t.receiver &&
                    t.receiver.track &&
                    t.receiver.track.kind === 'audio'
            );

            const videoTransceiver = pc.getTransceivers().find(
                t =>
                    t.receiver &&
                    t.receiver.track &&
                    t.receiver.track.kind === 'video'
            );

            if (audioTransceiver && audioTrack) {
                audioTransceiver.sender.replaceTrack(audioTrack);
            }

            if (videoTransceiver && videoTrack) {
                videoTransceiver.sender.replaceTrack(videoTrack);
            }

            pc.onicecandidate = event => {
                if (event.candidate) {
                    this.iceQueue.push(
                        JSON.stringify(event.candidate)
                    );
                }
            };

            pc.ontrack = event => {
                let stream = event.streams && event.streams[0];

                if (!stream) {
                    if (!this.remoteStreams[id]) {
                        this.remoteStreams[id] = new MediaStream();
                    }

                    stream = this.remoteStreams[id];

                    if (
                        !stream.getTracks().some(
                            track => track.id === event.track.id
                        )
                    ) {
                        stream.addTrack(event.track);
                    }
                }

                this.remoteStreams[id] = stream;
                this.updateVideoElement(id);
                this.playRemoteAudio(id, stream);
            };

            pc.ondatachannel = event => {
                if (event.channel) {
                    event.channel.onopen = () => {};
                    event.channel.onclose = () => {};
                    event.channel.onerror = () => {};
                }
            };

            pc.onconnectionstatechange = () => {
                console.log(
                    `WebRTC ${id}:`,
                    pc.connectionState
                );
            };

            pc.oniceconnectionstatechange = () => {
                console.log(
                    `ICE ${id}:`,
                    pc.iceConnectionState
                );
            };

            pc.onicegatheringstatechange = () => {
                console.log(
                    `ICE gathering ${id}:`,
                    pc.iceGatheringState
                );
            };
        }

        async waitForIceGatheringComplete(pc, timeout = 7000) {
            if (pc.iceGatheringState === 'complete') {
                return;
            }

            await new Promise(resolve => {
                let finished = false;

                const finish = () => {
                    if (finished) {
                        return;
                    }

                    finished = true;
                    clearTimeout(timer);
                    pc.removeEventListener(
                        'icegatheringstatechange',
                        check
                    );
                    resolve();
                };

                const check = () => {
                    if (pc.iceGatheringState === 'complete') {
                        finish();
                    }
                };

                const timer = setTimeout(finish, timeout);

                pc.addEventListener(
                    'icegatheringstatechange',
                    check
                );

                check();
            });
        }
        closeConnection(args) {
            const id = String(args.ID || '').trim();

            const pc = this.peerConnections[id];

            if (pc) {
                try {
                    pc.onicecandidate = null;
                    pc.ontrack = null;
                    pc.ondatachannel = null;
                    pc.close();
                } catch (e) {}

                delete this.peerConnections[id];
            }

            delete this.remoteStreams[id];
            delete this.pendingIce[id];

            if (this.containers[id]) {
                this.containers[id].remove();
                delete this.containers[id];
            }

            if (this.audioElements[id]) {
                this.audioElements[id].remove();
                delete this.audioElements[id];
            }
        }

        playRemoteAudio(id, stream) {
            if (!this.audioElements[id]) {
                const audio = document.createElement('audio');
                audio.autoplay = true;
                audio.controls = false;
                document.body.appendChild(audio);
                this.audioElements[id] = audio;
            }

            const audio = this.audioElements[id];
            audio.srcObject = stream;

            const p = audio.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {});
            }
        }

        async createOffer(args) {
            const pc = this.peerConnections[args.ID];
            if (!pc) return;

            try {
                if (!pc.__pmDataChannel) {
                    pc.__pmDataChannel = pc.createDataChannel('pm');
                }

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                await this.waitForIceGatheringComplete(pc);

                this.lastOffer = JSON.stringify(pc.localDescription);
            } catch (err) {
                console.error('Ошибка создания Offer:', err);
            }
        }

        getOfferText() {
            return this.lastOffer;
        }

        async flushIceQueue(id) {
            const pc = this.peerConnections[id];

            if (!pc || !pc.remoteDescription) {
                return;
            }

            while (this.pendingIce[id].length) {
                const candidate = this.pendingIce[id].shift();

                try {
                    await pc.addIceCandidate(candidate);
                } catch (err) {
                    console.error('Ошибка ICE:', err);
                }
            }
        }

        async setRemoteOffer(args) {
            const pc = this.peerConnections[args.ID];
            if (!pc) return;

            try {
                const text = String(args.TEXT).trim();

                if (!text.startsWith('{')) {
                    return;
                }

                await pc.setRemoteDescription(
                    new RTCSessionDescription(JSON.parse(text))
                );

                await this.flushIceQueue(args.ID);
            } catch (err) {
                console.error('Ошибка установки Offer:', err);
            }
        }

        async createAnswer(args) {
            const pc = this.peerConnections[args.ID];
            if (!pc) return;

            try {
                if (!pc.remoteDescription) {
                    const text = String(args.TEXT).trim();

                    if (text.startsWith('{')) {
                        await pc.setRemoteDescription(
                            new RTCSessionDescription(JSON.parse(text))
                        );
                    }
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await this.waitForIceGatheringComplete(pc);

                this.lastAnswer = JSON.stringify(pc.localDescription);

                await this.flushIceQueue(args.ID);
            } catch (err) {
                console.error('Ошибка создания Answer:', err);
            }
        }

        getAnswerText() {
            return this.lastAnswer;
        }

        async setRemoteAnswer(args) {
            const pc = this.peerConnections[args.ID];
            if (!pc) return;

            try {
                const text = String(args.TEXT).trim();

                if (!text.startsWith('{')) {
                    return;
                }

                await pc.setRemoteDescription(
                    new RTCSessionDescription(JSON.parse(text))
                );

                await this.flushIceQueue(args.ID);
            } catch (err) {
                console.error('Ошибка установки Answer:', err);
            }
        }

        getIceText() {
            if (this.iceQueue.length === 0) {
                return '';
            }

            return this.iceQueue.shift();
        }

        hasNewIceCandidate() {
            return this.iceQueue.length > 0;
        }

        async addIceCandidate(args) {
            const pc = this.peerConnections[args.ID];
            if (!pc) return;

            try {
                const text = String(args.TEXT).trim();

                if (!text.startsWith('{')) {
                    return;
                }

                const candidate = new RTCIceCandidate(JSON.parse(text));

                if (pc.remoteDescription) {
                    await pc.addIceCandidate(candidate);
                } else {
                    this.pendingIce[args.ID].push(candidate);
                }
            } catch (err) {
                console.error('Ошибка добавления ICE:', err);
            }
        }

        createVideoWindow(args) {
            this.ensureLocalStream();

            const id = args.ID;
            const type = args.TYPE;

            if (this.containers[id]) {
                this.containers[id].remove();
            }

            const wrapper = document.createElement('div');

            Object.assign(wrapper.style, {
                position: 'absolute',
                top: '50px',
                left: '50px',
                width: '170px',
                height: '130px',
                background: '#000',
                border: '2px solid white',
                borderRadius: '8px',
                overflow: 'hidden',
                resize: 'both',
                zIndex: '999999'
            });

            const video = document.createElement('video');

            video.dataset.type = type;
            video.autoplay = true;
            video.playsInline = true;
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'cover';

            if (type === 'я сам') {
                video.muted = true;
                video.srcObject = this.localStream;
            } else if (this.remoteStreams[id]) {
                video.srcObject = this.remoteStreams[id];
            }

            wrapper.appendChild(video);
            document.body.appendChild(wrapper);

            this.containers[id] = wrapper;

            const p = video.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {});
            }
        }

        updateVideoElement(id) {
            if (!this.containers[id]) {
                return;
            }

            const video = this.containers[id].querySelector('video');

            if (
                video &&
                video.dataset.type === 'собеседник' &&
                this.remoteStreams[id]
            ) {
                video.srcObject = this.remoteStreams[id];

                const p = video.play();
                if (p && typeof p.catch === 'function') {
                    p.catch(() => {});
                }
            }
        }
    }

    Scratch.extensions.register(new PureWebRTCExtension());

})(Scratch);
