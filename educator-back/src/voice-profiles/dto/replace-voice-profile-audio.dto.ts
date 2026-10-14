import { VoiceProfileDto, VoiceProfileResponseEnvelopeDto } from './voice-profile.dto';

/** `PUT /voice-profiles/:id/audio` takes only the file (`@UploadedFile()`) — no JSON body. */
export class ReplaceVoiceProfileAudioResponseDto extends VoiceProfileResponseEnvelopeDto {}
export { VoiceProfileDto as ReplaceVoiceProfileAudioResDto };
