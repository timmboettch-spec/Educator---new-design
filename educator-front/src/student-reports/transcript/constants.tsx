import {
  User,
  Activity,
  Info,
  FileText,
  ClipboardList,
  MessageSquare,
  Pill,
} from 'lucide-react';

import type { SpeakerStyle, CategoryStyle, TypeColorStyle } from './types';

/**
 * Filter options for transcript timeline
 */
export const FILTER_OPTIONS = [
  'Actions',
  'Common Actions',
  'Team Communication',
  'Medications',
  'Patient Overview',
  'Patient Responses',
  'Student Responses',
  'Orders',
] as const;

/**
 * Default selected filters (all options)
 */
export const DEFAULT_FILTERS = [...FILTER_OPTIONS];

/**
 * Speaker styles for message rendering
 */
export const getSpeakerStyles = (): Record<string, SpeakerStyle> => ({
  user: {
    icon: <User className="w-5 h-5 text-[#db8833]" />,
    label: 'Student Response',
    color: 'text-[#db8833]',
    badge: 'bg-[#FFF0EB] text-[#db8833] border-[#FFE7E0]',
    avatarBg: 'bg-[#FFF0EB]',
    bubbleBg: 'bg-[#fef2f2]',
    border: 'border-[#FFE7E0]',
  },
  provider: {
    icon: <MessageSquare className="w-5 h-5 text-blue-600" />,
    label: 'Provider',
    color: 'text-blue-600',
    badge: 'bg-blue-50 text-blue-600 border-blue-100',
    avatarBg: 'bg-blue-50',
    bubbleBg: 'bg-blue-50/30',
    border: 'border-blue-100',
  },
  assistant: {
    icon: <Activity className="w-5 h-5 text-teal-600" />,
    label: 'Patient Response',
    color: 'text-teal-600',
    badge: 'bg-teal-50 text-teal-600 border-teal-100',
    avatarBg: 'bg-teal-50',
    bubbleBg: 'bg-[#f0fdf4]',
    border: 'border-gray-100',
  },
  system: {
    icon: <Info className="w-5 h-5 text-gray-500" />,
    label: 'System',
    color: 'text-gray-500',
    badge: 'bg-gray-50 text-gray-500 border-gray-100',
    avatarBg: 'bg-gray-50',
    bubbleBg: 'bg-gray-50',
    border: 'border-gray-100',
  },
  order: {
    icon: <ClipboardList className="w-5 h-5 text-pink-600" />,
    label: 'Orders',
    color: 'text-pink-600',
    badge: 'bg-pink-50 text-pink-600 border-pink-100',
    avatarBg: 'bg-pink-50',
    bubbleBg: 'bg-pink-50/20',
    border: 'border-pink-100',
  },
  sbar_report: {
    icon: <FileText className="w-5 h-5 text-orange-600" />,
    label: 'Team Communication',
    color: 'text-orange-600',
    badge: 'bg-orange-50 text-orange-600 border-orange-100',
    avatarBg: 'bg-orange-50',
    bubbleBg: 'bg-orange-50/20',
    border: 'border-orange-100',
  },
  student_team_comm: {
    icon: <User className="w-5 h-5 text-[#db8833]" />,
    label: 'Student Response - Team Communication',
    color: 'text-[#db8833]',
    badge: 'bg-[#FFF0EB] text-[#db8833] border-[#FFE7E0]',
    avatarBg: 'bg-[#FFF0EB]',
    bubbleBg: 'bg-[#fef2f2]',
    border: 'border-[#FFE7E0]',
  },
});

/**
 * Category styles for summary entry rendering
 */
export const getCategoryMeta = (): Record<string, CategoryStyle> => ({
  vitals: {
    icon: <Activity className="w-3.5 h-3.5" />,
    label: 'Vitals',
    color: 'text-green-700',
    badge: 'bg-green-50 text-green-700 border-green-200',
    bg: 'bg-[#F0FDF4]',
    border: 'border-[#BBF7D0]',
  },
  demographics: {
    icon: <User className="w-3.5 h-3.5" />,
    label: 'Demographics',
    color: 'text-orange-700',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    bg: 'bg-[#F9FAFB]',
    border: 'border-gray-100',
  },
  history: {
    icon: <FileText className="w-3.5 h-3.5" />,
    label: 'History',
    color: 'text-blue-700',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    bg: 'bg-[#F0F7FF]',
    border: 'border-[#BFDBFE]',
  },
  actions: {
    icon: <ClipboardList className="w-3.5 h-3.5" />,
    label: 'Clinical Action',
    color: 'text-blue-700',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    bg: 'bg-[#eff6ff]',
    border: 'border-[#BFDBFE]',
  },
  orders: {
    icon: <ClipboardList className="w-3.5 h-3.5" />,
    label: 'Orders',
    color: 'text-violet-700',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    bg: 'bg-[#f5f3ff]',
    border: 'border-[#DDD6FE]',
  },
  medications: {
    icon: <Pill className="w-3.5 h-3.5" />,
    label: 'Medications',
    color: 'text-teal-700',
    badge: 'bg-[#4f9096] text-white border-transparent',
    bg: 'bg-white',
    border: 'border-gray-100',
  },
  team_communication: {
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    label: 'Team Communication',
    color: 'text-blue-700',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    bg: 'bg-blue-50/50',
    border: 'border-blue-100',
  },
});

/**
 * Get default category style
 */
export const getDefaultCategoryStyle = (category?: string): CategoryStyle => ({
  icon: <Activity className="w-3.5 h-3.5" />,
  label: category ?? 'Action',
  color: 'text-gray-700',
  badge: 'bg-gray-50 text-gray-700 border-gray-200',
  bg: 'bg-gray-50',
  border: 'border-gray-100',
});

/**
 * Common action type color mapping
 */
export const TYPE_COLOR_MAP: Record<string, TypeColorStyle> = {
  infection: {
    bg: 'bg-[#fff0e6]',
    border: 'border-[#FED7AA]',
    text: 'text-[#EA580C]',
    badge: 'bg-orange-50 text-orange-600 border-orange-200',
    badgeBorder: 'border-[#FED7AA]',
  },
  privacy: {
    bg: 'bg-[#e6faf7]',
    border: 'border-[#99F6E4]',
    text: 'text-[#0D9488]',
    badge: 'bg-teal-50 text-teal-600 border-teal-200',
    badgeBorder: 'border-[#99F6E4]',
  },
  environmental: {
    bg: 'bg-[#EFF6FF]',
    border: 'border-[#BFDBFE]',
    text: 'text-[#2563EB]',
    badge: 'bg-blue-50 text-blue-600 border-blue-200',
    badgeBorder: 'border-[#BFDBFE]',
  },
};
