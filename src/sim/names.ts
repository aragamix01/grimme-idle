import type { Job, Trait } from './types';

// Fairytale-flavoured names, more than the starting population so nobody shares one.
export const FIRST_NAMES = [
  'เซร่า', 'อัลดริก', 'มิร่า', 'โคริน', 'เอลด้า', 'แบรน', 'ลิส', 'โทบิน', 'เร็น', 'การ์ริก',
  'ไอโอน่า', 'เฟนน์', 'โรซาลินด์', 'ฮิวโก้', 'ทาเลีย', 'ออสริก', 'เนลล์', 'ดาเรียน', 'อีโซลด์', 'พิม',
  'ลูน่า', 'แคสเปอร์', 'ฟิออน่า', 'เกรตา', 'ฮันเซล', 'เกรเทล', 'รอบิน', 'แมเรียน', 'ออเบรอน', 'ไททาเนีย',
  'ปีเตอร์', 'เวนดี้', 'อลิซ', 'เบลล์', 'ออโรร่า', 'เซดริก', 'ไอวี่', 'ลีโอ', 'มาร์ลิน', 'ราพันเซล',
] as const;

export const DUNGEON_NAMES = [
  'ถ้ำหนามหลับใหล', 'สุสานรองเท้าแก้ว', 'ถ้ำแม่หมาป่า',
  'หอคอยไร้บันได', 'ซากปราสาทขนมปังขิง', 'ถ้ำทะเลสาบกระจก',
] as const;

export const JOB_TH: Record<Job, string> = {
  swordsman: 'นักดาบ',
  mage: 'จอมเวท',
  merchant: 'พ่อค้า',
  farmer: 'ชาวนา',
  thief: 'โจร',
};

export const TRAIT_TH: Record<Trait, string> = {
  greedy: 'โลภ',
  brave: 'กล้าหาญ',
  coward: 'ขี้ขลาด',
  loyal: 'ภักดี',
  vengeful: 'แค้นฝังใจ',
  kind: 'ใจดี',
};
