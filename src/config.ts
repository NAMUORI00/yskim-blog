export const SITE = {
  title: "나무가든",
  description: "연구·엔지니어링·지식관리 노트를 기록하는 블로그.",
  author: "yskim",
  handle: "namuori",
  location: "Seoul, Korea",
  url: "https://blog.namuori.net",
  github: "NAMUORI00",
  portfolio: "https://namuori.net/",
  locale: "ko-KR",
  giscus: {
    repo: "NAMUORI00/yskim-blog",
    repoId: "R_kgDOSz9RGA",
    category: "General",
    categoryId: "DIC_kwDOSz9RGM4C-vLv",
    mapping: "pathname",
  },
  // Search engine verification codes (paste from Search Console / 네이버 서치어드바이저).
  googleSiteVerification: "",
  naverSiteVerification: "",
  // Google AdSense publisher id (e.g. ca-pub-...). Empty disables ads.
  adsensePublisherId: "",
} as const;

export const UI = {
  navHome: "홈",
  navPosts: "글",
  navAbout: "소개",
  navPortfolio: "Portfolio",
  allPosts: "모든 글",
  categories: "카테고리",
  noCategories: "아직 카테고리가 없습니다",
  noPostsYet: "아직 게시된 글이 없습니다.",
  tags: "태그",
  recent: "최근 글",
  comments: "댓글",
  reactions: "반응",
  themeToggle: "화면 테마 전환",
  footerCopyright: "© yskim",
} as const;
