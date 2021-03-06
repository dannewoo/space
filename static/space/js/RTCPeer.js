export default class RTCPeer {
  constructor(options) {
    Object.assign(this, options);
    this.midObservers = {};
    this.init();
  }

  init() {
    this.tracksByMid = {};

    const pc = new RTCPeerConnection(this.config);
    this.close();
    this.pc = pc;

    pc.onnegotiationneeded = e => {
      this.sendToPeer(['renegotiate', null]);
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate)
        return;
      this.sendToPeer(['icecandidate', e.candidate]);
    };

    pc.ontrack = e => {
      const mid = e.transceiver.mid;
      this.tracksByMid[mid] = e.track;
      const obs = this.midObservers[mid];
      if (obs)
        obs(e.track);
    };

    if (!this.mediaStream)
      this.mediaStream = new MediaStream();
    this.mediaStream.addEventListener("addtrack", e => {
      this.pc.addTrack(e.track, this.mediaStream);
    });
    this.mediaStream.addEventListener("removetrack", e => {
      this.pc.removeTrack(e.track, this.mediaStream);
    });
    for (const track of this.mediaStream.getTracks())
      this.pc.addTrack(track, this.mediaStream);
  }

  addTrack(track) {
    this.pc.addTrack(track, this.mediaStream);
  }

  removeTrack(track) {
    this.pc.removeTrack(track, this.mediaStream);
  }

  setMidObserver(mid, observer) {
    this.midObservers[mid] = observer;
    const track = this.tracksByMid[mid];
    if (track)
      observer(track);
  }

  close() {
    if (this.pc)
      this.pc.close();
    this.pc = null;
  }

  async receiveFromPeer([name, value]) {
    const {pc} = this;
    if (name == 'offer') {
      this.pendingOffer = value;
      await pc.setRemoteDescription(value)
      if (this.pendingOffer != value)
        return console.log('bail 1!');
      const answer = await pc.createAnswer();
      if (!answer)
        return console.log('bail a!');
      if (this.pendingOffer != value)
        return console.log('bail 2!');
      this.pendingOffer = null;

      if (this.tweakSDP)
        answer.sdp = this.tweakSDP(answer.sdp);

      await pc.setLocalDescription(answer);
      this.sendToPeer(['answer', answer]);
    } else if (name == 'map') {
      this.midMap = value;
    } else if (name == 'icecandidate') {
      pc.addIceCandidate(value).catch(e => {
        // console.log("lol browsers amiright? https://crbug.com/935898", e);
      });
    } else {
      console.log(this, 'unknown rtc message:', name, value);
    }
  }
}
