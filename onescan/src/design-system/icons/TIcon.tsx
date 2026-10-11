import React from 'react';
import {
  ArrowLeftRight, Bell, BookOpen, Camera, Check, ChevronLeft, ChevronRight, CircleQuestionMark,
  Clock, Cloud, Coins, Contact, Copy, CopyPlus, CreditCard, Crop, Download, Ellipsis, Eraser,
  EyeOff, FileImage, FileLock, FileSpreadsheet, FileText, FileUp, FingerprintPattern, Folder,
  FolderPlus, Grid3x3, GripVertical, HardDrive, House, IdCard, Image, Images, Info, Languages,
  Layers, ListChecks, Lock, LogOut, LucideIcon, Merge, MessageSquareText, Minimize2, Palette,
  PenLine, Plus, Presentation, QrCode, Receipt, RefreshCw, RotateCw, ScanLine, ScanText, Search,
  Settings, Share2, ShieldCheck, Signature, SlidersHorizontal, Smartphone, Sparkles, Split, Trash,
  User, WifiOff, X, Zap, ZapOff,
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Single functional icon set. Screens reference semantic names, never the
 * underlying library, so the set can be swapped (e.g. TDesign icons) in one place.
 */
const registry = {
  home: House,
  documents: FileText,
  scan: ScanLine,
  ai: Sparkles,
  profile: User,
  search: Search,
  bell: Bell,
  folder: Folder,
  folderAdd: FolderPlus,
  cloud: Cloud,
  share: Share2,
  delete: Trash,
  edit: PenLine,
  settings: Settings,
  importPdf: FileUp,
  importPhoto: Image,
  gallery: Images,
  idCard: IdCard,
  receipt: Receipt,
  book: BookOpen,
  whiteboard: Presentation,
  businessCard: Contact,
  more: Ellipsis,
  close: X,
  back: ChevronLeft,
  chevronRight: ChevronRight,
  flashOn: Zap,
  flashOff: ZapOff,
  grid: Grid3x3,
  check: Check,
  plus: Plus,
  rotate: RotateCw,
  crop: Crop,
  filter: SlidersHorizontal,
  clean: Eraser,
  markup: PenLine,
  redact: EyeOff,
  ocr: ScanText,
  copy: Copy,
  duplicate: CopyPlus,
  download: Download,
  camera: Camera,
  layers: Layers,
  merge: Merge,
  split: Split,
  compress: Minimize2,
  protect: FileLock,
  sign: Signature,
  convert: ArrowLeftRight,
  toImage: FileImage,
  toExcel: FileSpreadsheet,
  chat: MessageSquareText,
  extract: ListChecks,
  translate: Languages,
  lock: Lock,
  shield: ShieldCheck,
  biometric: FingerprintPattern,
  devices: Smartphone,
  appearance: Palette,
  help: CircleQuestionMark,
  info: Info,
  logout: LogOut,
  plan: CreditCard,
  credits: Coins,
  storage: HardDrive,
  offline: WifiOff,
  drag: GripVertical,
  rescan: RefreshCw,
  recent: Clock,
  qr: QrCode,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof registry;

export const iconSizes = { sm: 16, md: 20, lg: 24, xl: 28 } as const;

export interface TIconProps {
  name: IconName;
  size?: keyof typeof iconSizes | number;
  color?: string;
  /** Stroke stays constant across the app for a uniform visual weight. */
  strokeWidth?: number;
}

export function TIcon({ name, size = 'lg', color, strokeWidth = 1.75 }: TIconProps) {
  const { colors } = useTheme();
  const Cmp = registry[name];
  const px = typeof size === 'number' ? size : iconSizes[size];
  return <Cmp size={px} color={color ?? colors.textPrimary} strokeWidth={strokeWidth} />;
}
