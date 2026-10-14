import { TranscriptSpeaker } from 'src/common/constants';

export interface TranscriptMessage {
  id: string;
  timestamp: string;
  text: string;
  speaker: TranscriptSpeaker;
}
