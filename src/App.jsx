import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ExternalLink,
  Newspaper,
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Bot,
  User,
  Bookmark,
  Star as StarIcon,
} from "lucide-react";

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDocs, setDoc, getDoc, setLogLevel } from 'firebase/firestore';

// These are placeholder components to mimic shadcn/ui for this single-file immersive.
const Alert = ({ variant, children, className }) => (
  <div className={`p-4 rounded-lg my-4 ${variant === 'destructive' ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-blue-100 text-blue-700 border border-blue-300'} ${className}`}>
    {children}
  </div>
);

const Card = ({ children, className }) => (
  <div className={`bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200 ${className}`}>
    {children}
  </div>
);

// Helper function for company logo placeholders
const getCompanyLogoUrl = (companyName) => {
  if (!companyName) return `https://placehold.co/32x32/E2E8F0/64748B?text=U`;
  switch (companyName.toLowerCase()) {
    case '네이버': return `https://placehold.co/32x32/2DB400/FFFFFF?text=N`;
    case '카카오': return `https://placehold.co/32x32/F9E000/000000?text=K`;
    case '토스': return `https://placehold.co/32x32/0046FF/FFFFFF?text=T`;
    case '당근마켓': return `https://placehold.co/32x32/FF6F00/FFFFFF?text=D`;
    default:
      const initial = companyName ? companyName.charAt(0).toUpperCase() : 'U';
      return `https://placehold.co/32x32/A0AEC0/FFFFFF?text=${initial}`;
  }
};

const ITNewsApp = () => {
  // State for news data and UI elements
  const [newsData, setNewsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [latestDate, setLatestDate] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showMoreCounts, setShowMoreCounts] = useState({});

  // State for Firebase services and user authentication
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // localStorage 유틸리티 함수들
  const getBookmarksFromStorage = () => {
    try {
      const bookmarks = localStorage.getItem('news-bookmarks');
      return bookmarks ? new Set(JSON.parse(bookmarks)) : new Set();
    } catch (error) {
      console.error('북마크 데이터 로드 실패:', error);
      return new Set();
    }
  };

  const saveBookmarksToStorage = (bookmarks) => {
    try {
      localStorage.setItem('news-bookmarks', JSON.stringify([...bookmarks]));
    } catch (error) {
      console.error('북마크 데이터 저장 실패:', error);
    }
  };

  // State for application features
  const [bookmarkedNewsIds, setBookmarkedNewsIds] = useState(() => getBookmarksFromStorage());
  const [aiInsights, setAiInsights] = useState({});
  const [loadingInsight, setLoadingInsight] = useState({});
  const [aiInsightMetrics, setAiInsightMetrics] = useState({});
  const [aiInsightComments, setAiInsightComments] = useState([]);
  const [isGeneratingAiReply, setIsGeneratingAiReply] = useState({});
  const [selectedKeyword, setSelectedKeyword] = useState(null);

  // --- Configuration ---
  const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'it-news-app-preview';
  const SHEET_ID = "1UFE_q1cuaa4WrgATcO6MlvZOgq1zKkU_IAHrJzxPU7U";
  const SHEET_NAME = "news";
  const SHEET_ID_DEEP = "1C-RjgQnJKdo4FlXF79CFOGMgEHaEELQrUyzSTI0lAhs";
  const SHEET_NAME_DEEP = "Deep";
  const GOOGLE_SHEETS_API_KEY = "AIzaSyDIig_uUt8grXOehM3JyI_sabFBh3EuTS8";
  const GEMINI_API_KEY = "AIzaSyDIig_uUt8grXOehM3JyI_sabFBh3EuTS8";
  const GA_MEASUREMENT_ID = "G-8VSL7PKF5M";

  const commentInputRefs = useRef({});

  // --- Firebase Initialization & Authentication ---
  useEffect(() => {
    let firebaseConfig;
    try {
      firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    } catch(e) {
      console.error("Failed to parse Firebase config:", e);
      setError("앱 설정을 불러오는 데 실패했습니다.");
      setLoading(false);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);
      setLogLevel('debug');

      setDb(firestore);
      setAuth(authInstance);

      const unsubscribeAuth = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
              await signInWithCustomToken(authInstance, __initial_auth_token);
            } else {
              await signInAnonymously(authInstance);
            }
            setUserId(authInstance.currentUser?.uid);
          } catch (authError) {
            console.error("Authentication failed:", authError);
            setError("사용자 인증에 실패했습니다. 익명 모드로 진행합니다.");
            setUserId(crypto.randomUUID());
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribeAuth();
    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setError("앱 초기화 중 오류가 발생했습니다.");
      setLoading(false);
    }
  }, []);

  // --- Google Analytics 4 (GA4) Integration ---
  useEffect(() => {
    const scriptId = 'ga-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      document.head.appendChild(script);

      script.onload = () => {
        window.dataLayer = window.dataLayer || [];
        function gtag(){window.dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID, {
          send_page_view: false
        });
        console.log("GA4 script loaded and initialized.");

        gtag('event', 'page_view', {
          page_path: window.location.pathname + window.location.search,
          page_title: document.title,
          page_location: window.location.href,
        });
        console.log("Initial GA4 page_view sent.");
      };
    }
  }, []);

  useEffect(() => {
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: `/${activeTab}`,
        page_title: `키워드뉴스 - ${activeTab} 탭`,
        page_location: window.location.origin + `/${activeTab}`,
      });
      console.log(`GA4 page_view for tab: ${activeTab} sent.`);
    }
  }, [activeTab]);

  // --- Data Fetching: Google Sheets News ---
  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError("");

    let currentSheetId = SHEET_ID;
    let currentSheetName = SHEET_NAME;
    let dataMapping = {};

    if (activeTab === 'deep') {
      currentSheetId = SHEET_ID_DEEP;
      currentSheetName = SHEET_NAME_DEEP;
      dataMapping = {
        title: 0,
        newsContent: 1,
        detailedContent1: 2,
        detailedContent2: 3,
        detailedContent3: 4,
        detailedContent4: 5,
        detailedContent5: 6,
        url: 7,
        imageUrl: 8,
        date: 9,
      };
    } else {
      dataMapping = {
        title: 0,
        keyword: 1,
        source: 2,
        tags: 3,
        url: 4,
        date: 5,
        summary: 6,
        content: 7,
        imageUrl: 8,
        nickname: 9,
        companyName: 10,
        jobTitle: 11,
        recommendationStrength: 12,
        recommendationReason: 13,
        likes: 14,
      };
    }

    if (!GOOGLE_SHEETS_API_KEY) {
      console.warn("Google Sheets API key is missing. Using simulated data.");
      loadSimulatedData(activeTab);
      return;
    }

    try {
      const encodedSheetName = encodeURIComponent(currentSheetName);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${currentSheetId}/values/${encodedSheetName}?key=${GOOGLE_SHEETS_API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google Sheets API Error: ${response.status} - ${errorData.error.message}`);
      }

      const data = await response.json();
      const rows = data.values;

      if (!rows || rows.length <= 1) {
        throw new Error("No data found in Google Sheets.");
      }

      const dataRows = rows.slice(1);
      const parsedNews = dataRows.map((row) => {
        const newsItem = {};

        // Assign data from row to newsItem object
        Object.keys(dataMapping).forEach(key => {
          newsItem[key] = row[dataMapping[key]] || '';
        });

        // Generate a consistent, unique ID based on title and date
        newsItem.id = `${newsItem.title.replace(/[^a-zA-Z0-9가-힣]/g, '')}-${newsItem.date}`;

        return newsItem;
      }).filter(news => news.title);

      setNewsData(parsedNews);
      if (parsedNews.length > 0) {
        const latest = parsedNews.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date;
        setLatestDate(latest);
      }
    } catch (err) {
      console.error("Failed to fetch from Google Sheets:", err);
      setError(`뉴스 데이터를 불러오는 데 실패했습니다. (${err.message})`);
      loadSimulatedData(activeTab);
    } finally {
      setLoading(false);
    }
  }, [activeTab, GOOGLE_SHEETS_API_KEY, SHEET_ID, SHEET_NAME, SHEET_ID_DEEP, SHEET_NAME_DEEP]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Simulated data for development/fallback
  const loadSimulatedData = useCallback((tab) => {
    const commonSimulatedData = [
      {
        title: "네이버, AI 검색 서비스 대폭 개선... 정확도 30% 향상", keyword: "네이버", source: "IT조선", tags: "#AI #검색 #기술혁신 #추천", url: "https://example.com/news1", date: "2025-08-01", time: '16:10', summary: "네이버가 자체 개발한 AI 기술을 적용하여 검색 정확도를 크게 개선했으며, 사용자 만족도가 크게 향상될 것으로 예상됩니다.", content: "이는 대규모 언어 모델(LLM)과 최신 검색 알고리즘을 결합한 결과입니다. 사용자들은 이제 더 빠르고 정확한 정보를 얻을 수 있을 것으로 기대됩니다.",
        imageUrl: "https://placehold.co/100x80/2DB400/FFFFFF?text=NAVER_NEWS",
        nickname: "개발자김", companyName: "네이버", jobTitle: "AI 개발자", recommendationStrength: 5, recommendationReason: "이 기사는 AI 검색의 미래를 보여줍니다.", likes: 12
      },
      {
        title: "토스, 투자 플랫폼 '토스증권' 월 거래액 10조원 돌파", keyword: "토스", source: "매일경제", tags: "#핀테크 #투자 #거래액 #추천", url: "https://example.com/news2", date: "2025-07-31", time: '16:00', summary: "토스증권이 월 거래액 10조원을 돌파하며 핀테크 시장의 새로운 강자로 떠올랐습니다.", content: "간편한 인터페이스와 다양한 투자 상품으로 2030 세대의 높은 지지를 받고 있으며, 시장 점유율을 빠르게 확대하고 있습니다.",
        imageUrl: "https://placehold.co/100x80/0046FF/FFFFFF?text=TOSS_NEWS",
        nickname: "투자박", companyName: "토스", jobTitle: "증권 애널리스트", recommendationStrength: 4, recommendationReason: "핀테크 투자의 중요성을 강조합니다.", likes: 8
      },
      {
        title: "카카오, 새로운 소셜 서비스 '카카오뷰' 출시", keyword: "카카오", source: "전자신문", tags: "#소셜 #플랫폼 #신규서비스", url: "https://example.com/news3", date: "2025-07-31", time: '15:30', summary: "카카오가 콘텐츠 큐레이션 기반의 새로운 소셜 서비스 '카카오뷰'를 출시하며 플랫폼 영향력 강화에 나섰습니다.", content: "사용자들이 직접 콘텐츠를 큐레이션하고 발행할 수 있는 기능을 제공하며, 새로운 정보 소비 방식을 제안합니다.",
        imageUrl: "https://placehold.co/100x80/F9E000/000000?text=KAKAO_NEWS",
        nickname: "콘텐츠이", companyName: "카카오", jobTitle: "서비스 기획자", recommendationStrength: 3, recommendationReason: "새로운 소셜 경험을 위한 필수 서비스.", likes: 25
      },
      {
        title: "당근마켓, 지역 커뮤니티 활성화로 월 사용자 2천만 명 달성", keyword: "당근마켓", source: "블로터", tags: "#커뮤니티 #중고거래 #추천", url: "https://example.com/news4", date: "2025-07-30", time: '10:00', summary: "당근마켓이 단순 중고거래를 넘어 지역 커뮤니티 플랫폼으로 자리매김하며 월간 활성 사용자(MAU) 2천만 명을 돌파했습니다.", content: "이웃과의 소통과 정보 교환을 통해 지역 생활에 필수적인 앱으로 성장했으며, 다양한 연령대의 사용자를 확보하고 있습니다.",
        imageUrl: "https://placehold.co/100x80/FF6F00/FFFFFF?text=DAANGN_NEWS",
        nickname: "마케터정", companyName: "당근마켓", jobTitle: "마케팅 전문가", recommendationStrength: 5, recommendationReason: "지역 기반 서비스의 성공 사례입니다.", likes: 40
      },
      {
        title: "새로운 기술 동향, 블록체인 기반 서비스 확산", keyword: "블록체인", source: "테크월드", tags: "#블록체인 #기술동향", url: "https://example.com/news5", date: "2025-08-01", time: '09:00', summary: "블록체인 기술이 다양한 산업 분야로 확산되며 새로운 서비스 모델을 제시하고 있습니다.", content: "금융, 유통, 제조 등 여러 분야에서 블록체인 기반의 혁신적인 솔루션이 등장하고 있으며, 이에 대한 기대감이 커지고 있습니다.",
        imageUrl: "https://placehold.co/100x80/4A90E2/FFFFFF?text=BLOCKCHAIN",
        nickname: "", companyName: "", jobTitle: "", recommendationStrength: 0, recommendationReason: "", likes: 7
      },
      {
        title: "클라우드 서비스, 기업 디지털 전환 핵심으로 부상", keyword: "클라우드", source: "디지털데일리", tags: "#클라우드 #디지털전환", url: "https://example.com/news6", date: "2025-08-01", time: '08:00', summary: "클라우드 컴퓨팅이 기업의 디지털 전환을 가속화하는 핵심 기술로 주목받고 있습니다.", content: "유연성과 확장성을 바탕으로 기업 IT 인프라의 효율성을 극대화하며, 새로운 비즈니스 기회를 창출하고 있습니다.",
        imageUrl: "https://placehold.co/100x80/FF9900/FFFFFF?text=CLOUD",
        nickname: "클라우드김", companyName: "AWS", jobTitle: "클라우드 아키텍트", recommendationStrength: 4, recommendationReason: "클라우드 도입을 고민하는 기업에게 필독!", likes: 15
      },
    ];

    const deepSimulatedData = [
      {
        title: "Deep Learning, 의료 진단 혁신을 이끌다",
        newsContent: "최신 딥러닝 기술이 의료 영상 분석에 적용되어 질병 진단 정확도를 크게 높이고 있습니다.",
        detailedContent1: "알파고가 의료 분야에 적용된 이후, 인공지능 기반의 진단 보조 시스템은 암 조기 발견, 희귀 질환 진단 등 다양한 영역에서 인간 의사의 역량을 보완하며 혁신을 가져오고 있습니다.",
        detailedContent2: "특히, 딥러닝 모델은 방대한 의료 데이터를 학습하여 미세한 패턴까지 인식함으로써 진단의 신뢰도를 향상시키고 있습니다.",
        detailedContent3: "이러한 기술 발전은 의료 서비스의 접근성을 높이고, 개인 맞춤형 치료의 가능성을 열어줄 것입니다.",
        detailedContent4: "",
        detailedContent5: "",
        url: "https://example.com/deep1",
        imageUrl: "https://img.hankyung.com/photo/202508/01.41398148.1.jpg",
        date: "2025-08-22",
      },
      {
        title: "자율주행 기술, 딥러닝으로 안전성 강화",
        newsContent: "자율주행 자동차의 인지 및 판단 시스템이 딥러닝 알고리즘을 통해 더욱 정교해지고 있습니다.",
        detailedContent1: "테슬라, 구글 웨이모 등 선두 기업들은 딥러닝 기반의 컴퓨터 비전과 센서 퓨전 기술을 활용하여 복잡한 도로 상황을 정확하게 인식하고 예측하는 데 집중하고 있습니다.",
        detailedContent2: "이는 악천후, 야간 주행 등 다양한 환경에서도 안정적인 자율주행을 가능하게 하며, 사고 발생률을 획기적으로 줄일 것으로 기대됩니다.",
        detailedContent3: "하지만 법적, 윤리적 문제 해결과 사회적 수용성 확보가 여전히 중요한 과제로 남아있습니다.",
        detailedContent4: "",
        detailedContent5: "",
        url: "https://example.com/deep2",
        imageUrl: "https://placehold.co/600x300/6C757D/FFFFFF?text=AUTONOMOUS",
        date: "2025-08-21",
      },
      {
        title: "생성형 AI, 콘텐츠 산업의 판도를 바꾸다",
        newsContent: "텍스트, 이미지, 비디오 등 다양한 형태의 콘텐츠를 생성하는 AI 기술이 빠르게 발전하고 있습니다.",
        detailedContent1: "달리(DALL-E), 미드저니(Midjourney)와 같은 생성형 AI 모델들은 예술, 디자인, 마케팅 등 콘텐츠 제작 전반에 혁신을 가져오고 있습니다.",
        detailedContent2: "사용자의 간단한 지시만으로 고품질의 결과물을 만들어내며, 창작의 경계를 확장하고 새로운 비즈니스 기회를 창출하고 있습니다.",
        detailedContent3: "특히 개인화된 콘텐츠 제작과 효율적인 워크플로우 구축에 기여하며, 미래 콘텐츠 시장의 핵심 동력이 될 것입니다.",
        detailedContent4: "하지만 저작권 문제와 AI 윤리 가이드라인 마련이 시급한 상황입니다.",
        detailedContent5: "이러한 과제들을 해결하며 생성형 AI는 더욱 발전할 것입니다.",
        url: "https://example.com/deep3",
        imageUrl: "https://placehold.co/600x300/FFC107/000000?text=GENERATIVE_AI",
        date: "2025-08-18",
      },
    ];

    let dataToLoad = [];
    if (tab === 'deep') {
      dataToLoad = deepSimulatedData;
    } else {
      dataToLoad = commonSimulatedData;
    }

    // Generate a consistent ID for each simulated news item
    const parsedNews = dataToLoad.map(news => ({
      ...news,
      id: `${news.title.replace(/[^a-zA-Z0-9가-힣]/g, '')}-${news.date}`
    }));

    setNewsData(parsedNews);
    if (parsedNews.length > 0) {
      const latest = parsedNews.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date;
      setLatestDate(latest);
    }
    setLoading(false);
  }, []);

  // localStorage 기반 북마크 초기화 및 동기화
  useEffect(() => {
    // 앱 시작 시 localStorage에서 북마크 로드
    const storedBookmarks = getBookmarksFromStorage();
    setBookmarkedNewsIds(storedBookmarks);
  }, []);

  // --- Firestore Listeners (AI 기능용) ---
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const metricsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/aiInsightMetrics`);
    const unsubscribeMetrics = onSnapshot(metricsCollectionRef, (snapshot) => {
      const fetched = {};
      snapshot.forEach(doc => { fetched[doc.id] = doc.data(); });
      setAiInsightMetrics(fetched);
    }, (error) => console.error("Failed to load AI insight metrics:", error));

    const commentsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/aiInsightComments`);
    const unsubscribeComments = onSnapshot(query(commentsCollectionRef), (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAiInsightComments(fetchedComments);
    }, (error) => console.error("Failed to load AI insight comments:", error));

    return () => {
      unsubscribeMetrics();
      unsubscribeComments();
    };
  }, [db, userId, isAuthReady, APP_ID]);

  // --- Event Handlers & Logic ---

  const handleLoadMore = (date) => {
    setShowMoreCounts(p => ({ ...p, [date]: (p[date] || 10) + 7 }));
  };

  const toggleBookmark = (newsId) => {
    setBookmarkedNewsIds(prev => {
      const newBookmarks = new Set(prev);
      if (newBookmarks.has(newsId)) {
        newBookmarks.delete(newsId);
      } else {
        newBookmarks.add(newsId);
      }
      saveBookmarksToStorage(newBookmarks);
      return newBookmarks;
    });
  };

  const callGeminiAPI = async (prompt) => {
    const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (response.ok) {
          const result = await response.json();
          if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
            return result.candidates[0].content.parts[0].text;
          }
        } else if (response.status === 429) {
          console.warn(`Rate limited. Retrying in ${Math.pow(2, i)}s...`);
          await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
        } else {
          const errorText = await response.text();
          throw new Error(`API 오류: ${response.status} - ${errorText}`);
        }
      } catch (fetchError) {
        console.error(`Fetch attempt ${i + 1} failed:`, fetchError);
        if (i === 2) throw fetchError;
        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
      }
    }
    throw new Error("AI 응답 생성 실패: 최대 재시도 횟수를 초과했습니다.");
  };

  const fetchAiInsight = async (newsId, newsTitle) => {
    setLoadingInsight(p => ({ ...p, [newsId]: true }));
    try {
      const prompt = `"${newsTitle}" 기사의 시사점을 IT 전문가 관점에서 3줄로 요약하여 제안해주세요.`;
      const insightText = await callGeminiAPI(prompt);
      setAiInsights(p => ({ ...p, [newsId]: insightText }));
    } catch (e) {
      setAiInsights(p => ({ ...p, [newsId]: `AI 인사이트 생성 실패: ${e.message}` }));
    } finally {
      setLoadingInsight(p => ({ ...p, [newsId]: false }));
    }
  };

  const handleAiInsightVote = async (newsId, voteType) => {
    if (!db || !userId) return;
    const metricDocRef = doc(db, `artifacts/${APP_ID}/public/data/aiInsightMetrics`, String(newsId));
    try {
      const docSnap = await getDoc(metricDocRef);
      const currentData = docSnap.data() || { upvotes: 0, downvotes: 0 };
      const update = {
        upvotes: currentData.upvotes + (voteType === 'up' ? 1 : 0),
        downvotes: currentData.downvotes + (voteType === 'down' ? 1 : 0)
      };
      await setDoc(metricDocRef, { newsId, ...update }, { merge: true });
    } catch (e) { console.error("AI insight vote update failed:", e); }
  };

  const handleAddAiInsightComment = async (newsId, newsTitle) => {
    const inputElement = commentInputRefs.current[newsId];
    if (!inputElement || !inputElement.value.trim() || !db || !userId) {
        console.warn("Comment input or Firebase not ready. Comment not added.");
        return;
    }
    const commentText = inputElement.value;
    inputElement.value = '';

    const commentsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/aiInsightComments`);
    try {
      await addDoc(commentsCollectionRef, { newsId, text: commentText, timestamp: new Date().toISOString(), userId, role: "user" });
      setIsGeneratingAiReply(p => ({ ...p, [newsId]: true }));
      const prompt = `뉴스 제목: "${newsTitle}"\n인간 댓글: "${commentText}"\n\n이 댓글에 대해 AI로서 다음 형식에 맞춰 답변해줘:\n[AI의 생각] (댓글 분석 요약 1줄)\n[1줄 반박 논리]\n[근거1]\n[근거2]`;
      const aiReplyText = await callGeminiAPI(prompt);
      await addDoc(commentsCollectionRef, { newsId, text: aiReplyText, timestamp: new Date().toISOString(), userId: "AI", role: "ai" });
    } catch (e) {
      setError(`댓글 처리 중 오류 발생: ${e.message}`);
    } finally {
      setIsGeneratingAiReply(p => ({ ...p, [newsId]: false }));
    }
  };

  // --- Rendering Logic ---
  const recentNews = newsData.filter(news => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return new Date(news.date) >= oneWeekAgo;
  });
  const uniqueKeywords = [...new Set(recentNews.map(news => news.keyword).filter(Boolean))];

  const filteredNewsData = newsData.filter(news => {
    if (activeTab === "all") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const isRecent = new Date(news.date) >= oneWeekAgo;
      const matchesKeyword = !selectedKeyword || news.keyword === selectedKeyword;
      return isRecent && matchesKeyword;
    }
    if (activeTab === "recommended") return news.tags?.includes("추천");
    if (activeTab === "bookmarks") return bookmarkedNewsIds.has(news.id);
    if (activeTab === "subscribe") {
      return news.nickname && news.companyName && news.jobTitle && news.recommendationReason && news.recommendationStrength > 0;
    }
    if (activeTab === "deep") {
      return news.title && news.newsContent && (news.detailedContent1 || news.detailedContent2 || news.detailedContent3 || news.detailedContent4 || news.detailedContent5) && news.imageUrl;
    }
    return true;
  });

  const groupedNewsByDate = filteredNewsData.reduce((groups, news) => {
    const date = news.date || "날짜 없음";
    if (!groups[date]) groups[date] = [];
    groups[date].push(news);
    return groups;
  }, {});
  const sortedDates = Object.keys(groupedNewsByDate).sort((a, b) => new Date(b) - new Date(a));

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header Section */}
      <header className="sticky top-0 bg-white shadow-sm z-20">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Newspaper className="text-blue-600 w-7 h-7" />
            <h1 className="text-2xl font-bold text-gray-900">키워드뉴스</h1>
          </div>
          {latestDate && !['subscribe', 'deep'].includes(activeTab) && (
            <span className="text-gray-500 text-sm self-center">
              업데이트: {latestDate}
            </span>
          )}
        </div>
        {/* Navigation Tabs */}
        <div className="flex justify-start border-b border-gray-200 bg-gray-50 px-4">
          {["all", "bookmarks"].map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); }}
              className={`py-3 px-5 text-base font-semibold transition-colors duration-200 ${
                activeTab === tab
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
              }`}
            >
              {tab === 'recommended' ? '추천' : tab === 'all' ? '전체' : tab === 'bookmarks' ? '북마크' : tab === 'subscribe' ? '구독' : tab === 'deep' ? '분석' : '관리'}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-4 sm:p-6">
        {loading && <div className="text-center text-gray-500 p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div><p>뉴스 데이터를 불러오는 중...</p></div>}
        {error && !loading && <Alert variant="destructive" className="mx-auto max-w-4xl">{error}</Alert>}

        {activeTab === 'all' && !loading && (
          <div className="max-w-4xl mx-auto mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedKeyword(null)}
                className={`px-4 py-1 rounded-full text-sm font-semibold transition-colors duration-200 ${
                  selectedKeyword === null ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                전체
              </button>
              {uniqueKeywords.map(keyword => (
                <button
                  key={keyword}
                  onClick={() => setSelectedKeyword(keyword)}
                  className={`px-4 py-1 rounded-full text-sm font-semibold transition-colors duration-200 ${
                    selectedKeyword === keyword ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  {keyword}
                </button>
              ))}
            </div>
          </div>
        )}

        {['all', 'bookmarks'].includes(activeTab) && !loading && (
            <>
              {sortedDates.length === 0 && !error && (
                  <div className="text-center text-gray-500 p-8 mt-8">
                      <MessageCircle className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                      <h3 className="text-xl font-semibold text-gray-700">표시할 뉴스가 없습니다.</h3>
                      <p className="text-gray-500 mt-2">
                        {activeTab === 'bookmarks' ? '북마크한 뉴스가 여기에 표시됩니다.' :
                          '다른 탭을 확인해보세요.'}
                      </p>
                  </div>
              )}
              {sortedDates.map(date => (
                  <section key={date} className="max-w-4xl mx-auto mb-8">
                    {activeTab !== 'deep' && (
                        <h2 className="text-lg font-bold text-gray-700 mb-3 pl-2 border-l-4 border-blue-500">{date}</h2>
                    )}
                    <div className="space-y-4">
                        {groupedNewsByDate[date].slice(0, showMoreCounts[date] || 10).map((news) => (
                            <Card key={news.id} className="p-4 bg-white hover:shadow-md transition-shadow duration-200">
                                {activeTab === 'subscribe' && news.nickname && news.companyName && (
                                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
                                    <div className="flex items-center gap-2">
                                      <img
                                        src={getCompanyLogoUrl(news.companyName)}
                                        alt={news.companyName}
                                        className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-200 flex-shrink-0"
                                      />
                                      <div className="text-sm">
                                        <span className="font-semibold text-gray-800">{news.nickname}</span>
                                        <span className="text-gray-500 ml-1">({news.companyName} | {news.jobTitle})</span>
                                      </div>
                                    </div>
                                    <button className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors flex items-center gap-1">
                                      <Bookmark size={14} /> 구독중
                                    </button>
                                  </div>
                                )}

                                {activeTab === 'deep' ? (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
                                      <div className="flex items-center gap-2">
                                        <img src="https://placehold.co/32x32/FFDAB9/000000?text=J" alt="Jungja-ilro IT News Logo" className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-200 flex-shrink-0"/>
                                        <div className="text-sm">
                                          <span className="font-semibold text-gray-800">정자일로 IT 뉴스 - 1,700명 구독중</span>
                                          <p className="text-gray-500 text-xs mt-0.5">현직 네이버 IT 기획자 PM의 눈으로 뉴스를 바라봅니다.</p>
                                        </div>
                                      </div>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-2">{news.title}</h3>
                                    {news.newsContent && (
                                      <div className="bg-gray-100 p-3 rounded-md mb-3">
                                        <p className="text-base text-gray-700 leading-relaxed">{news.newsContent}</p>
                                      </div>
                                    )}
                                    {news.imageUrl && (
                                      <div className="flex justify-center mb-3">
                                        <img
                                          src={news.imageUrl}
                                          alt={news.title}
                                          className="max-w-full h-auto object-contain rounded-md max-h-72"
                                          onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/600x300/E2E8F0/64748B?text=No+Img`; }}
                                        />
                                      </div>
                                    <div className="flex justify-end items-center gap-3 mt-3 mb-4">
                                      {news.url && (
                                        <a href={news.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium">
                                          <ExternalLink size={14} /> 원문 보기
                                        </a>
                                      )}
                                    </div>
                                    {[news.detailedContent1, news.detailedContent2, news.detailedContent3, news.detailedContent4, news.detailedContent5].map((paragraph, pIndex) => (
                                      paragraph && (
                                        <div key={pIndex} className="flex items-start mb-3">
                                          <div className="w-1 h-6 bg-orange-400 mr-3 flex-shrink-0"></div>
                                          <p className="text-base text-gray-800 leading-relaxed flex-grow" dangerouslySetInnerHTML={{ __html: paragraph.replace(/_([^_]+)_/g, '<u>$1</u>') }}></p>
                                        </div>
                                      )
                                    ))}
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex justify-between items-start gap-4 pt-3 border-t border-gray-100">
                                      <h3 className="text-base text-gray-800 mb-1 flex-grow">{news.title}</h3>
                                      {activeTab !== 'subscribe' && (
                                        <button onClick={() => toggleBookmark(news.id)} className="p-2 rounded-full hover:bg-yellow-100 transition-colors flex-shrink-0" aria-label="Toggle bookmark">
                                          <Star size={22} className={bookmarkedNewsIds.has(news.id) ? "text-yellow-500 fill-current" : "text-gray-400 hover:text-yellow-500"} />
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-start gap-4 mt-2">
                                      {news.imageUrl && (
                                        <img
                                          src={news.imageUrl}
                                          alt={news.title}
                                          className="w-24 h-20 object-cover rounded-md flex-shrink-0"
                                          onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/100x80/E2E8F0/64748B?text=No+Img`; }}
                                        />
                                      )}
                                      <p className="flex-grow text-gray-700 text-base leading-relaxed">{news.summary}</p>
                                    </div>
                                    {news.content && (
                                      <p className="text-gray-700 text-base leading-relaxed mt-3 border-t border-gray-100 pt-3">{news.content}</p>
                                    )}
                                  </>
                                )}

                                <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                    <span className="bg-gray-100 px-2 py-1 rounded-md font-medium">{news.keyword}</span>
                                    <span>{news.source}</span>
                                    {news.url && activeTab !== 'deep' && <a href={news.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"><ExternalLink size={14} />원문 보기</a>}
                                    {(activeTab === 'subscribe' || activeTab === 'all' || activeTab === 'recommended' || activeTab === 'bookmarks') && news.date && (
                                      <span className="text-gray-500 text-xs flex-shrink-0">{news.date}</span>
                                    )}
                                  </div>
                                </div>

                                {activeTab === 'subscribe' && news.recommendationReason && news.recommendationStrength > 0 && (
                                  <div className="mt-4 pt-4 border-t border-gray-200 text-gray-700 bg-gray-50 p-3 rounded-md">
                                    <p className="text-base">"{news.recommendationReason}"</p>
                                    <div className="flex items-center justify-end mt-1">
                                      <span className="mr-2 text-gray-600">추천 강도:</span>
                                      {[...Array(5)].map((_, i) => (
                                        <StarIcon
                                          key={i}
                                          size={16}
                                          className={i < news.recommendationStrength ? "text-yellow-300 fill-current" : "text-gray-300"}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {activeTab !== 'subscribe' && activeTab !== 'deep' && (
                                  <div className="mt-4 pt-4 border-t border-gray-200">
                                    {!aiInsights[news.id] && (
                                        <div className="flex justify-between items-center">
                                            {activeTab === 'recommended' ? (
                                                <div className="flex items-center">
                                                    <div className="flex -space-x-2 mr-2">
                                                        <img className="inline-block h-6 w-6 rounded-full ring-2 ring-white" src="https://placehold.co/32x32/2DB400/FFFFFF?text=N" alt="Naver logo" />
                                                        <img className="inline-block h-6 w-6 rounded-full ring-2 ring-white" src="https://placehold.co/32x32/F9E000/000000?text=K" alt="Kakao logo" />
                                                    </div>
                                                    <span className="text-[11px] font-medium text-gray-600">네이버, 카카오 등 종사자 8명 북마크</span>
                                                </div>
                                            ) : <div />}
                                            <button
                                                onClick={() => fetchAiInsight(news.id, news.title)}
                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                                                disabled={loadingInsight[news.id]}
                                            >
                                                {loadingInsight[news.id] ? (
                                                    <>
                                                        <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
                                                        <span>생성 중...</span>
                                                ) : (
                                                    '✨ AI VIEW'
                                                )}
                                            </button>
                                        </div>
                                    )}
                                    {aiInsights[news.id] && (
                                        <div className="mt-2 p-4 bg-gray-50 rounded-lg text-gray-800 text-sm w-full">
                                            <p className="whitespace-pre-wrap">{aiInsights[news.id]}</p>
                                            <div className="flex items-center gap-4 text-sm text-gray-600 mt-3 border-t pt-3 border-gray-200">
                                                <span className="font-semibold">인사이트 평가:</span>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleAiInsightVote(news.id, 'up')} className="p-1 rounded-full hover:bg-green-100"><ThumbsUp size={16} className="text-green-600" /></button>
                                                    <span>{aiInsightMetrics[news.id]?.upvotes || 0}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleAiInsightVote(news.id, 'down')} className="p-1 rounded-full hover:bg-red-100"><ThumbsDown size={16} className="text-red-600" /></button>
                                                    <span>{aiInsightMetrics[news.id]?.downvotes || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                )}
                            </Card>
                        ))}
                        {groupedNewsByDate[date].length > (showMoreCounts[date] || 10) && (
                            <div className="text-center mt-4">
                                <button onClick={() => handleLoadMore(date)} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-full font-semibold hover:bg-gray-300 transition-colors">더 불러오기 ({groupedNewsByDate[date].length - (showMoreCounts[date] || 10)}개 남음)</button>
                            </div>
                        )}
                    </div>
                  </section>
              ))}
            </>
        )}
      </main>
    </div>
  );
};

export default ITNewsApp;
