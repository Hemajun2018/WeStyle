
export enum StyleType {
  NYT = 'New York Times',
  CLAUDE = 'Claude Minimalist',
  LITERARY = 'Classic Literary',
  MODERN_WECHAT = 'Modern WeChat',
  LOGIC = 'Logic Thinking',
  ZEN = 'Zen Minimalist',
  QBIT = 'QbitAI Tech',
  TECH_MAG = 'Tech Magazine',
  DEEP_BLUE_BRIEF = 'Deep Blue Brief',
}

export interface FormattingOption {
  id: StyleType;
  name: string;
  description: string;
  previewColor: string;
}

export interface ImagePlan {
  artStyle: string;
  images: {
    prompt: string;
    // A unique short sentence or phrase from the text where this image should follow
    positionKeyword: string; 
  }[];
}

export const FORMATTING_OPTIONS: FormattingOption[] = [
  {
    id: StyleType.DEEP_BLUE_BRIEF,
    name: "深蓝简报风",
    description: "深蓝主色搭配金色点缀，编号条与内容淡蓝背景，沉稳清晰。",
    previewColor: "bg-[#0762D2]"
  },
  {
    id: StyleType.TECH_MAG,
    name: "科技杂志风",
    description: "网格背景，橙色胶囊标题，卡片式引用，极具现代科技感。",
    previewColor: "bg-[#c66e49]"
  },
  {
    id: StyleType.QBIT,
    name: "量子位风",
    description: "科技感强的青绿色主调，左侧高亮边框，适合前沿科技报道。",
    previewColor: "bg-[#00997f]"
  },
  {
    id: StyleType.LOGIC,
    name: "罗辑思维风",
    description: "经典的橙色L型边框与灰色底纹，理性且极具辨识度。",
    previewColor: "bg-[#e36c09]"
  },
  {
    id: StyleType.ZEN,
    name: "极简禅意风",
    description: "大字间距与留白，搭配动态波纹分隔符，轻盈且治愈。",
    previewColor: "bg-[#f0f0f0]"
  },
  {
    id: StyleType.MODERN_WECHAT,
    name: "知识大V风",
    description: "经典橙色主调，卡片式引用，适合深度阅读与观点输出。",
    previewColor: "bg-orange-500"
  },
  {
    id: StyleType.NYT,
    name: "纽约时报风",
    description: "经典衬线字体，首字下沉，极简且权威。",
    previewColor: "bg-slate-800"
  },
  {
    id: StyleType.CLAUDE,
    name: "Claude 极简",
    description: "现代无衬线，高对比度，适合技术与评论。",
    previewColor: "bg-[#b56a5d]"
  },
  {
    id: StyleType.LITERARY,
    name: "文艺书信",
    description: "柔和背景，居中版式，适合散文与情感。",
    previewColor: "bg-[#5c7c68]"
  }
];

// Extend the Window interface for the AI Studio environment
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
