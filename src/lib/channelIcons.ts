import type { LucideIcon } from 'lucide-react';
import {
  Baby,
  Bot,
  Brain,
  BriefcaseBusiness,
  CheckCheck,
  ChefHat,
  Code,
  Dumbbell,
  FlaskConical,
  Globe,
  GraduationCap,
  Hash,
  House,
  LineChart,
  Megaphone,
  Moon,
  PenSquare,
  Plane,
  SearchCheck,
  Sparkles,
  Utensils,
  Wallet,
} from 'lucide-react';

const CHANNEL_ICON_MAP: Record<string, LucideIcon> = {
  baby: Baby,
  bot: Bot,
  brain: Brain,
  'briefcase-business': BriefcaseBusiness,
  'check-check': CheckCheck,
  'chef-hat': ChefHat,
  code: Code,
  dumbbell: Dumbbell,
  'flask-conical': FlaskConical,
  globe: Globe,
  'graduation-cap': GraduationCap,
  house: House,
  'line-chart': LineChart,
  megaphone: Megaphone,
  moon: Moon,
  'pen-square': PenSquare,
  plane: Plane,
  'search-check': SearchCheck,
  sparkles: Sparkles,
  utensils: Utensils,
  wallet: Wallet,
};

export function getChannelIcon(iconKey: string): LucideIcon {
  return CHANNEL_ICON_MAP[iconKey] || Hash;
}
