import AVFoundation

enum SpeechVoice {
  static let preferenceKey = "speechVoiceID"
  static var available: [AVSpeechSynthesisVoice] {
    let systemID = AVSpeechSynthesisVoice(language: "en-US")?.identifier
    return AVSpeechSynthesisVoice.speechVoices().filter {
      $0.language.hasPrefix("en-") && !$0.voiceTraits.contains(.isNoveltyVoice)
        && !$0.voiceTraits.contains(.isPersonalVoice)
    }.sorted {
      if $0.quality != $1.quality { return $0.quality.rawValue > $1.quality.rawValue }
      if ($0.language == "en-US") != ($1.language == "en-US") { return $0.language == "en-US" }
      if ($0.identifier == systemID) != ($1.identifier == systemID) { return $0.identifier == systemID }
      return $0.name.localizedStandardCompare($1.name) == .orderedAscending
    }
  }
  static var selected: AVSpeechSynthesisVoice? {
    let voices = available
    let saved = UserDefaults.standard.string(forKey: preferenceKey) ?? ""
    return voices.first { $0.identifier == saved } ?? voices.first
      ?? AVSpeechSynthesisVoice(language: "en-US")
  }
  static func label(_ voice: AVSpeechSynthesisVoice) -> String {
    let quality: String
    switch voice.quality {
    case .premium: quality = "Premium"
    case .enhanced: quality = "Enhanced"
    default: quality = "Standard"
    }
    return "\(voice.name) · \(quality) · \(voice.language)"
  }
  static func utterance(_ text: String, voice: AVSpeechSynthesisVoice? = selected) -> AVSpeechUtterance {
    let result = AVSpeechUtterance(string: text)
    result.voice = voice
    result.rate = AVSpeechUtteranceDefaultSpeechRate
    result.pitchMultiplier = 1
    return result
  }
}
