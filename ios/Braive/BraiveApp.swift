import AVFoundation
import SwiftUI

@main struct BraiveApp: App {
  @StateObject var session = Session()
  @Environment(\.scenePhase) var lifecycle
  var body: some Scene {
    WindowGroup {
      ContentView(s: session).preferredColorScheme(.dark).onChange(of: lifecycle) { _, value in
        UIApplication.shared.isIdleTimerDisabled = value == .active
        session.pause("app_inactive", enabled: value != .active)
      }
    }
  }
}
struct ContentView: View {
  @ObservedObject var s: Session
  @State var typed = ""
  @State var confirmDelete = false
  private enum Panel: String, Identifiable { case settings, typing, controls; var id: String { rawValue } }
  @State private var panel: Panel?
  @AppStorage("viewerIPD") var ipd = 64.0
  @AppStorage("viewerK1") var k1 = 0.0
  @AppStorage("viewerK2") var k2 = 0.0
  @AppStorage("viewerFOV") var fov = 70.0
  @AppStorage("speechVoiceID") var speechVoiceID = ""
  @State private var speechVoices: [AVSpeechSynthesisVoice] = []
  private let accent = Color(red: 0.94, green: 0.74, blue: 0.58)
  private let ink = Color(red: 0.045, green: 0.075, blue: 0.07)
  var body: some View {
    GeometryReader { geo in
      ZStack {
        StereoWorld(world: s.world).ignoresSafeArea().blur(
          radius: s.phase == .setup ? 9 : s.phase == .reveal ? max(0, (1 - s.reveal) * 7) : 0)
        if s.phase == .setup {
          LinearGradient(colors: [ink.opacity(0.98), ink.opacity(0.8), ink.opacity(0.5)],
            startPoint: .leading, endPoint: .trailing).ignoresSafeArea()
          ScrollView(.vertical) { welcome }.scrollIndicators(.hidden)
        } else {
          if [.intro, .planning, .error].contains(s.phase) || s.loading {
            Color.black.opacity(s.phase == .intro ? 1 : 0.82).ignoresSafeArea()
          }
          if s.phase == .reveal { Color.black.opacity(max(0, 1 - s.reveal)).ignoresSafeArea() }
          HStack(spacing: 0) {
            eyeHUD.frame(width: geo.size.width / 2)
            eyeHUD.frame(width: geo.size.width / 2)
          }
        }
        if !s.pauses.isEmpty {
          Color.black.opacity(0.91).ignoresSafeArea()
          HStack(spacing: 0) {
            pauseHUD.frame(width: geo.size.width / 2)
            pauseHUD.frame(width: geo.size.width / 2)
          }
        }
        if s.phase == .setup {
        VStack {
          HStack {
            HStack(spacing: 9) {
              if UIImage(named: "BrandMark") != nil { Image("BrandMark").resizable().scaledToFit().frame(width: 30,height:30).clipShape(RoundedRectangle(cornerRadius:7)) }
              Text("braive").font(.system(size: 22, weight: .semibold, design: .serif)).tracking(-0.5)
            }
            Spacer()
            Button { panel = .settings } label: {
              Image(systemName: "slider.horizontal.3").frame(width: 36, height: 36)
            }.accessibilityLabel("Settings")
          }.foregroundStyle(.white.opacity(0.8)).padding(.horizontal, 28).padding(.top, 8)
          Spacer()
        }.allowsHitTesting(s.pauses.isEmpty)
        }
      }.onLongPressGesture(minimumDuration: 1.2) { if s.phase != .setup { panel = .controls } }
    }
    .sheet(item: $panel) { selected in
      switch selected {
      case .settings: settingsView
      case .typing: typingView
      case .controls: phoneControlsView
      }
    }
    .onAppear {
      UIApplication.shared.isIdleTimerDisabled = true
      applyViewer()
    }
    .onChange(of: panel) { _, value in
      s.pause("phone_controls", enabled: value != nil)
      if value != .settings { s.audio.stopVoicePreview() }
    }
    .onChange(of: s.server) { _, value in UserDefaults.standard.set(value, forKey: "server") }
    .onChange(of: s.token) { _, value in UserDefaults.standard.set(value, forKey: "token") }
  }
  var welcome: some View {
    HStack(alignment: .center, spacing: 40) {
      VStack(alignment: .leading, spacing: 14) {
        Text("YOUR NEXT TRY STARTS HERE").font(.system(size: 10, weight: .semibold)).tracking(2.4)
          .foregroundStyle(accent)
        Text("Practice before\nit counts.")
          .font(.system(size: 43, weight: .regular, design: .serif)).tracking(-1.5)
          .fixedSize(horizontal: false, vertical: true)
        Text("Try something unfamiliar.\nFind your footing. Go again.")
          .font(.system(size: 15)).foregroundStyle(.white.opacity(0.7)).lineSpacing(4)
        HStack(spacing: 8) {
          Image(systemName: "waveform").foregroundStyle(accent)
          Text("Describe it. Practice it. Try again.")
        }.font(.system(size: 12)).padding(.top, 4)
      }.frame(maxWidth: .infinity, alignment: .leading)
      VStack(alignment: .leading, spacing: 14) {
        Text("Your voice.\nYour next challenge.")
          .font(.system(size: 20, weight: .medium, design: .serif))
        Text("Describe the moment you want to practice. Speech stays on this iPhone; your words shape the experience.")
          .font(.system(size: 13)).foregroundStyle(.white.opacity(0.65)).fixedSize(horizontal: false, vertical: true)
        Toggle(isOn: $s.remoteConsent) {
          Text("Allow Meta to process my practice details and transcribed answers.")
            .font(.system(size: 11)).foregroundStyle(.white.opacity(0.75))
        }.tint(accent).toggleStyle(.switch)
        Button {
          s.liveEnabled = true
          s.connect()
        } label: {
          HStack {
            if s.connecting { ProgressView().tint(ink) }
            Text(s.connecting ? "Getting ready…" : "Start practice").fontWeight(.semibold)
            Spacer()
            Image(systemName: "arrow.up.right")
          }.font(.system(size: 14)).padding(.horizontal, 18).padding(.vertical, 14)
            .foregroundStyle(ink).background(accent, in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain).disabled(!s.remoteConsent || s.connecting)
          .opacity(s.remoteConsent ? 1 : 0.55)
        Text(s.setupNotice.isEmpty ? "Stay seated or stand still. Remove the viewer and hold the screen for phone controls." : s.setupNotice)
          .font(.system(size: 10)).foregroundStyle(.white.opacity(0.55)).fixedSize(horizontal: false, vertical: true)
      }.padding(22).frame(maxWidth: 340)
        .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.12), lineWidth: 1))
    }.padding(.horizontal, 44).padding(.top, 50).padding(.bottom, 16).frame(maxWidth: 1050)
  }
  var eyeHUD: some View {
    HeadsetHUD(copy: s.headsetCopy,
      status: s.voiceListening ? (s.characterReplyPending ? "Reply on its way" : "Listening") : s.connecting ? "Getting ready" : "Voice unavailable",
      remaining: s.phase == .active && !s.loading ? s.remaining : nil,
      preparing: s.loading || (s.phase == .planning && !s.builder))
  }
  var pauseHUD: some View {
    HeadsetHUD(copy: s.pausedHeadsetCopy, status: "Paused")
  }
  func send(_ text: String) {
    // Sheet dismissal's onChange runs later; release only this pause before a manual command.
    s.pause("phone_controls", enabled: false)
    s.heard(text, final: true, id: UUID().uuidString)
  }
  func applyViewer() {
    s.world.ipd = Float(ipd / 1000); s.world.fov = fov
    s.world.lensK1 = Float(k1); s.world.lensK2 = Float(k2)
  }
  var phoneControlsView: some View {
    NavigationStack {
      Form {
        Section {
          Text("Use these controls with the viewer removed.").foregroundStyle(.secondary)
          if s.pauses.contains("command_channel_unavailable") || s.pauses.contains("audio_interruption") {
            Button(s.connecting ? "Reconnecting…" : "Reconnect voice") { s.reconnect() }.disabled(s.connecting)
          }
          if s.pauses.contains("user_stop") {
            Button("Continue practice") { panel = nil; send("no") }
            Button("End practice") { panel = nil; send("yes") }
          } else if s.canStop {
            Button("Pause practice") { panel = nil; s.stop() }
          }
          if s.phase == .lobby { Button("Start practice") { panel = nil; send("start") } }
          if s.isCollectingAnswer {
            Button("Finish answer") { panel = nil; send("that's all") }
            Button("Replace answer") { panel = nil; send("start over") }
          }
          if s.phase == .review {
            Button("Begin practice") { panel = nil; send("begin practice") }
            Button("Start over") { panel = nil; send("start over") }
          }
          if [.headset, .history, .reflectionPrompt, .feedbackPrompt, .repeatPrompt].contains(s.phase) {
            Button("Yes") { panel = nil; send("yes") }
            Button("No") { panel = nil; send("no") }
          }
          if s.phase == .error {
            ForEach(["Retry", "Revise", "Cancel"], id: \.self) { value in
              Button(value) { panel = nil; send(value) }
            }
          }
          Button("Type an answer") { panel = .typing }
          Button("Settings") { panel = .settings }
        }
        Section("Full prompt") {
          Text(s.message).textSelection(.enabled)
        }
        if !s.transcript.isEmpty {
          Section("Your words") { Text(s.transcript).textSelection(.enabled) }
        }
      }.navigationTitle("Phone controls").tint(accent)
        .toolbar { Button("Done") { panel = nil } }
    }
  }
  var typingView: some View {
    NavigationStack {
      Form {
        Section {
          Text(s.message).font(.headline)
          TextField("Your answer", text: $typed, axis: .vertical).lineLimit(2...5)
          Button("Send answer") {
            let answer = typed.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !answer.isEmpty else { return }
            typed = ""; panel = nil
            send(s.isCollectingAnswer ? answer + ". That's all." : answer)
          }
        }
      }.navigationTitle("Type your answer")
        .toolbar { Button("Done") { panel = nil } }
    }
  }
  var settingsView: some View {
    NavigationStack {
      Form {
        Section("Voice") {
          Picker("Speaking voice", selection: $speechVoiceID) {
            Text("Automatic · best available").tag("")
            ForEach(speechVoices, id: \.identifier) { voice in
              Text(SpeechVoice.label(voice)).tag(voice.identifier)
            }
          }
          if let current = speechVoices.first(where: { $0.identifier == speechVoiceID }) ?? speechVoices.first {
            Text("Using \(SpeechVoice.label(current))").font(.caption).foregroundStyle(.secondary)
            if current.quality == .default {
              Text("For a more natural voice, download an Enhanced or Premium English voice in iPhone Settings → Accessibility → Read & Speak → Voices. Return here when it’s ready.")
                .font(.caption).foregroundStyle(.secondary)
            }
          }
          Button("Listen to voice") { s.audio.previewVoice() }
        }
        Section("Headset fit") {
          Slider(value: $ipd, in: 55...75, step: 1)
          Text("Eye separation: \(Int(ipd)) mm")
          Slider(value: $fov, in: 45...100)
          Text("Field of view: \(Int(fov))°")
          Slider(value: $k1, in: 0...0.6, step: 0.01)
          Text("Lens adjustment: \(k1, specifier: "%.2f")")
          Slider(value: $k2, in: 0...0.6, step: 0.01)
          Text("Edge adjustment: \(k2, specifier: "%.2f")")
          Button("Apply & center view") { applyViewer(); s.world.recenter() }
        }
        Section("Your sessions") {
          ShareLink("Export session history", item: s.store.root.appendingPathComponent("SESSIONS.csv"))
          Button("Delete history and reflections", role: .destructive) { confirmDelete = true }
        }
        Section("Voice controls") {
          Text("Finish a setup answer with THAT’S ALL. Say HELP during practice to hear your next options. STOP pauses practice; NO resumes from your place.")
            .font(.footnote).foregroundStyle(.secondary)
        }
        Section("About Braive") {
          Text("Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
            .font(.footnote).foregroundStyle(.secondary)
        }
        Section {
          DisclosureGroup("Connection setup") {
            TextField("Practice server address", text: $s.server).textInputAutocapitalization(.never)
              .autocorrectionDisabled().keyboardType(.URL)
            SecureField("Pairing code", text: $s.token)
            Text(s.connection).font(.caption).textSelection(.enabled)
            Text("For this development build, connect to the paired Mac on the same network.")
              .font(.caption).foregroundStyle(.secondary)
          }
        }
      }.tint(accent).navigationTitle("Settings").toolbar { Button("Done") { panel = nil } }
        .onAppear { refreshVoices() }
        .onDisappear { s.audio.stopVoicePreview() }
        .onReceive(NotificationCenter.default.publisher(for: AVSpeechSynthesizer.availableVoicesDidChangeNotification)) { _ in refreshVoices() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in refreshVoices() }
        .confirmationDialog("Delete your sessions and reflections?", isPresented: $confirmDelete) {
          Button("Delete all", role: .destructive) {
            do { try s.store.deleteAll() } catch { s.fail(error) }
          }
        }
    }
  }
  func refreshVoices() {
    speechVoices = SpeechVoice.available
    if !speechVoiceID.isEmpty && !speechVoices.contains(where: { $0.identifier == speechVoiceID }) {
      speechVoiceID = ""
    }
  }
}
