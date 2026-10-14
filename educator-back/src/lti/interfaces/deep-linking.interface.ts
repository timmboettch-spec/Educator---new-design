/**
 * LTI 1.3 Deep Linking interfaces
 * 
 * Deep Linking allows educators to select content from the tool
 * and have the LMS automatically create activities for students.
 */

export interface DeepLinkingSettings {
  /** URL where the tool must POST the Deep Linking response */
  deep_link_return_url: string;
  
  /** Content types accepted by the platform (e.g., ['ltiResourceLink']) */
  accept_types: string[];
  
  /** Document targets accepted for content presentation */
  accept_presentation_document_targets?: string[];
  
  /** Whether the platform accepts multiple items in one response */
  accept_multiple?: boolean;
  
  /** Whether the platform will auto-create the activities */
  auto_create?: boolean;
  
  /** Optional title for the selection UI */
  title?: string;
  
  /** Optional descriptive text for the selection UI */
  text?: string;
  
  /** Opaque data token that must be returned unchanged */
  data?: string;
}

export interface LtiContentItem {
  /** Type of content item */
  type: 'ltiResourceLink' | 'link' | 'html' | 'image' | 'file';
  
  /** Title of the content item (becomes activity name in LMS) */
  title?: string;
  
  /** Description of the content item */
  text?: string;
  
  /** Launch URL for the content (for ltiResourceLink) */
  url?: string;
  
  /** Custom parameters to include in launches of this content */
  custom?: Record<string, string>;
  
  /** Optional line item for grade passback */
  lineItem?: {
    scoreMaximum: number;
    label: string;
    resourceId?: string;
    tag?: string;
  };
  
  /** Optional iframe display settings */
  iframe?: {
    width?: number;
    height?: number;
  };
  
  /** Optional window display settings */
  window?: {
    targetName?: string;
    width?: number;
    height?: number;
  };
  
  /** Optional availability window */
  available?: {
    startDateTime?: string;
    endDateTime?: string;
  };
  
  /** Optional submission deadline */
  submission?: {
    endDateTime?: string;
  };
}

export interface DeepLinkingResponse {
  /** Array of content items to be created in the LMS */
  content_items: LtiContentItem[];
  
  /** Opaque data token from the request (must be returned unchanged) */
  data?: string;
  
  /** Optional message to display to the user */
  msg?: string;
  
  /** Optional log message for debugging */
  log?: string;
  
  /** Optional error message */
  errormsg?: string;
  
  /** Optional error log for debugging */
  errorlog?: string;
}
