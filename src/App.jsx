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
  Send,
  Search,
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
  const [selectedKeyword, setSelectedKeyword] = useState('전체');
  const [searchTerm, setSearchTerm] = useState('');

  // State for Firebase services and user authentication
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Firestore-synced state for application features
  const [bookmarkedNewsIds, setBookmarkedNewsIds] = useState(new Set());
  const [aiInsights, setAiInsights] = useState({});
  const [loadingInsight, setLoadingInsight] = useState({});
  const [aiInsightMetrics, setAiInsightMetrics] = useState({});
  const [aiInsightComments, setAiInsightComments] = useState([]);
  const [isGeneratingAiReply, setIsGeneratingAiReply] = useState({});

  const commentInputRefs = useRef({});

  // --- Configuration ---
  const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'it-news-app-preview';
  const SHEET_ID = "1UFE_q1cuaa4WrgATcO6MlvZOgq1zKkU_IAHrJzxPU7U";
  const SHEET_NAME = "news";
  const SHEET_ID_DEEP = "1C-RjgQnJKdo4FlXF79CFOGMgEHaEELQrUyzSTI0lAhs";
  const SHEET_NAME_DEEP = "Deep";
  
  // Note: These API keys are placeholders and should be managed securely in a real application.
   const GOOGLE_SHEETS_API_KEY = "AIzaSyDIig_uUt8grXOehM3JyI_sabFBh3EuTS8";
  const GEMINI_API_KEY = "AIzaSyDIig_uUt8grXOehM3JyI_sabFBh3EuTS8";
  const GA_MEASUREMENT_ID = "G-8VSL7PKF5M";

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


  // --- Firebase Firestore Listeners ---

   // localStorage 기반 북마크 초기화 및 동기화
  useEffect(() => {
    // 앱 시작 시 localStorage에서 북마크 로드
    const storedBookmarks = getBookmarksFromStorage();
    setBookmarkedNewsIds(storedBookmarks);
  }, []);

  // --- Firestore Listeners (AI 기능용) ---
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    // Listen for AI insight metrics
    const metricsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/aiInsightMetrics`);
    const unsubscribeMetrics = onSnapshot(metricsCollectionRef, (snapshot) => {
      const fetched = {};
      snapshot.forEach(doc => { fetched[doc.id] = doc.data(); });
      setAiInsightMetrics(fetched);
    }, (error) => console.error("Failed to load AI insight metrics:", error));

    // Listen for AI insight comments
    const commentsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/aiInsightComments`);
    const unsubscribeComments = onSnapshot(query(commentsCollectionRef), (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAiInsightComments(fetchedComments);
    }, (error) => console.error("Failed to load AI insight comments:", error));

    // Listen for user bookmarks
    const bookmarksCollectionRef = collection(db, `artifacts/${APP_ID}/users/${userId}/bookmarks`);
    const unsubscribeBookmarks = onSnapshot(bookmarksCollectionRef, (snapshot) => {
      const fetchedBookmarks = new Set(snapshot.docs.map(doc => doc.id));
      setBookmarkedNewsIds(fetchedBookmarks);
    }, (error) => console.error("Failed to load bookmarks:", error));

    return () => {
      unsubscribeMetrics();
      unsubscribeComments();
      unsubscribeBookmarks();
    };
  }, [db, userId, isAuthReady, APP_ID]);

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
    }
  }, [activeTab]);

  // --- Data Fetching: Google Sheets News ---
  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError("");

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

    let currentSheetId = SHEET_ID;
    let currentSheetName = SHEET_NAME;
    let dataMapping = {
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

    if (!GOOGLE_SHEETS_API_KEY) {
      console.warn("Google Sheets API key is missing. Using simulated data.");
      
      const parsedNews = commonSimulatedData.map(news => ({
        ...news,
        id: `${news.title.replace(/[^a-zA-Z0-9가-힣]/g, '')}-${news.date}`
      }));

      setNewsData(parsedNews);
      if (parsedNews.length > 0) {
        const latest = parsedNews.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date;
        setLatestDate(latest);
      }
      setLoading(false);
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
      const parsedNews = commonSimulatedData.map(news => ({
        ...news,
        id: `${news.title.replace(/[^a-zA-Z0-9가-힣]/g, '')}-${news.date}`
      }));
      setNewsData(parsedNews);
      setLatestDate(parsedNews.length > 0 ? parsedNews.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date : "");
    } finally {
      setLoading(false);
    }
  }, [activeTab, GOOGLE_SHEETS_API_KEY, SHEET_ID, SHEET_NAME, SHEET_ID_DEEP, SHEET_NAME_DEEP]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // --- Event Handlers & Logic ---
  const handleKeywordClick = (keyword) => {
    setSelectedKeyword(keyword);
    setSearchTerm('');
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setSelectedKeyword('전체'); // Clear keyword filter when searching
  };
  
  const toggleBookmark = async (newsId) => {
    if (!db || !userId) {
        console.warn("Firebase or user not ready. Bookmark not saved.");
        return;
    }
    const bookmarkDocRef = doc(db, `artifacts/${APP_ID}/users/${userId}/bookmarks`, newsId);
    try {
        if (bookmarkedNewsIds.has(newsId)) {
            await deleteDoc(bookmarkDocRef);
        } else {
            await setDoc(bookmarkDocRef, { bookmarkedAt: new Date().toISOString() });
        }
    } catch (e) {
        console.error("Failed to toggle bookmark:", e);
    }
  };

  const callGeminiAPI = async (prompt) => {
    const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    
    // Using exponential backoff for retries
    for (let i = 0; i < 3; i++) {
        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (response.ok) {
                const result = await response.json();
                if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return result.candidates[0].content.parts[0].text;
                }
            } else if (response.status === 429) {
                await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
            } else {
                const errorText = await response.text();
                throw new Error(`API 오류: ${response.status} - ${errorText}`);
            }
        } catch (fetchError) {
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
  const allKeywords = [...new Set(newsData.map(news => news.keyword).filter(Boolean))].sort();
  const keywordsWithDefault = ['전체', ...allKeywords];

  const filteredNewsData = newsData.filter(news => {
    if (activeTab === "bookmarks") {
      return bookmarkedNewsIds.has(news.id);
    }

    const keywordMatch = selectedKeyword === '전체' || news.keyword === selectedKeyword;
    const searchMatch = searchTerm.trim() === '' || 
      news.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      news.summary.toLowerCase().includes(searchTerm.toLowerCase());

    return keywordMatch && searchMatch;
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
          {userId && (
            <div className="text-xs text-gray-400">
              <span className="font-medium">User ID:</span> <span className="text-gray-500 font-mono break-all">{userId}</span>
            </div>
          )}
          {latestDate && activeTab === 'all' && (
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
              onClick={() => { setActiveTab(tab); setSelectedKeyword('전체'); setSearchTerm(''); }}
              className={`py-3 px-5 text-base font-semibold transition-colors duration-200 ${
                activeTab === tab
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
              }`}
            >
              {tab === 'all' ? '전체' : '북마크'}
            </button>
          ))}
        </div>
        {/* Keyword Bubbles & Search for 'all' tab */}
        {activeTab === 'all' && (
          <>
            <div className="p-4 bg-gray-100 border-b border-gray-200 overflow-x-auto whitespace-nowrap scrollbar-hide">
              {keywordsWithDefault.map(keyword => (
                <button
                  key={keyword}
                  onClick={() => handleKeywordClick(keyword)}
                  className={`inline-block px-3 py-1 mr-2 text-sm font-medium rounded-full transition-colors
                    ${selectedKeyword === keyword
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-200'
                    }`}
                >
                  {keyword}
                </button>
              ))}
            </div>
            <div className="p-4 bg-gray-100 border-b border-gray-200">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="뉴스 검색..." 
                        className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                </div>
            </div>
          </>
        )}
      </header>

      {/* Main Content Area */}
      <main className="p-4 sm:p-6">
        {loading && <div className="text-center text-gray-500 p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div><p>뉴스 데이터를 불러오는 중...</p></div>}
        {error && !loading && <Alert variant="destructive" className="mx-auto max-w-4xl">{error}</Alert>}

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
                    <h2 className="text-lg font-bold text-gray-700 mb-3 pl-2 border-l-4 border-blue-500">{date}</h2>
                    <div className="space-y-4">
                        {groupedNewsByDate[date].map((news) => (
                            <Card key={news.id} className="p-4 bg-white hover:shadow-md transition-shadow duration-200">
                                <div className="flex justify-between items-start gap-4 pt-3 border-t border-gray-100">
                                    <h3 className="text-base text-gray-800 mb-1 flex-grow">{news.title}</h3>
                                    <button onClick={() => toggleBookmark(news.id)} className="p-2 rounded-full hover:bg-yellow-100 transition-colors flex-shrink-0" aria-label="Toggle bookmark">
                                      <Star size={22} className={bookmarkedNewsIds.has(news.id) ? "text-yellow-500 fill-current" : "text-gray-400 hover:text-yellow-500"} />
                                    </button>
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

                                <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                    <span className="bg-gray-100 px-2 py-1 rounded-md font-medium">{news.keyword}</span>
                                    <span>{news.source}</span>
                                    {news.url && <a href={news.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"><ExternalLink size={14} />원문 보기</a>}
                                    {news.date && (
                                      <span className="text-gray-500 text-xs flex-shrink-0">{news.date}</span>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-200">
                                    {!aiInsights[news.id] ? (
                                        <div className="flex justify-end items-center">
                                            <button
                                                onClick={() => fetchAiInsight(news.id, news.title)}
                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                                                disabled={loadingInsight[news.id]}
                                            >
                                                {loadingInsight[news.id] ? (
                                                    <>
                                                        <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
                                                        <span>생성 중...</span>
                                                    </>
                                                ) : (
                                                    '✨ AI VIEW'
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="mt-2 p-4 bg-gray-50 rounded-lg text-gray-800 text-sm w-full">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Bot size={20} className="text-gray-500" />
                                                <span className="font-semibold text-gray-700">AI 인사이트</span>
                                            </div>
                                            <p className="whitespace-pre-wrap leading-relaxed">{aiInsights[news.id]}</p>
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
                                            {/* Comment Section */}
                                            <div className="mt-4 pt-4 border-t border-gray-200">
                                                <h4 className="text-sm font-semibold text-gray-700 mb-2">댓글</h4>
                                                <div className="space-y-3 mb-4 max-h-48 overflow-y-auto pr-2">
                                                    {aiInsightComments
                                                        .filter(c => c.newsId === news.id)
                                                        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                                                        .map((comment) => (
                                                            <div key={comment.id} className={`flex items-start gap-2 ${comment.role === 'ai' ? 'bg-blue-50 p-2 rounded-md' : ''}`}>
                                                                <span className="flex-shrink-0">{comment.role === 'ai' ? <Bot size={18} className="text-gray-500 mt-1" /> : <User size={18} className="text-gray-500 mt-1" />}</span>
                                                                <div className="flex-grow">
                                                                    <p className="text-xs text-gray-500 font-medium">{comment.role === 'ai' ? 'AI' : `사용자 (${comment.userId.substring(0, 4)}...)`}</p>
                                                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{comment.text}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    {isGeneratingAiReply[news.id] && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                                            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                                            <span>AI가 답변을 작성 중입니다...</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        ref={el => commentInputRefs.current[news.id] = el}
                                                        placeholder="여기에 댓글을 입력하세요..."
                                                        className="flex-grow p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleAddAiInsightComment(news.id, news.title);
                                                        }}
                                                    />
                                                    <button onClick={() => handleAddAiInsightComment(news.id, news.title)} className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center">
                                                        <Send size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
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
