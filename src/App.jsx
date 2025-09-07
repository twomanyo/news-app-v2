import React, { useState, useEffect, useCallback } from "react";
import {
  ExternalLink,
  Newspaper,
  Star,
} from "lucide-react";

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  setLogLevel,
} from "firebase/firestore";

const Alert = ({ variant, children, className }) => (
  <div
    className={`p-4 rounded-lg my-4 ${
      variant === "destructive"
        ? "bg-red-100 text-red-700 border border-red-300"
        : "bg-blue-100 text-blue-700 border border-blue-300"
    } ${className}`}
  >
    {children}
  </div>
);

const Card = ({ children, className }) => (
  <div
    className={`bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200 ${className}`}
  >
    {children}
  </div>
);

const ITNewsApp = () => {
  const [newsData, setNewsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [latestDate, setLatestDate] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [bookmarkedNewsIds, setBookmarkedNewsIds] = useState(new Set());

  // Firestore 관련 상태
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // 전역 변수에서 App ID와 Firebase Config 가져오기
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  // Google Sheets API 설정
  const SHEET_ID =
    "1UFE_q1cuaa4WrgATcO6MlvZOgq1zKkU_IAHrJzxPU7U";
  const SHEET_NAME = "news";
  const GOOGLE_SHEETS_API_KEY =
    "AIzaSyDIig_uUt8grXOehM3JyI_sabFBh3EuTS8";

  // Firebase 초기화 및 익명 로그인
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);
      setLogLevel("debug");

      setDb(firestore);

      const authListener = onAuthStateChanged(authInstance, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          setUserId(crypto.randomUUID());
        }
        setIsAuthReady(true);
      });
      
      // 익명 로그인 시도
      const signIn = async () => {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(authInstance, initialAuthToken);
          } else {
            await signInAnonymously(authInstance);
          }
        } catch (authError) {
          console.error("Firebase authentication failed:", authError);
          // 인증 실패 시 익명 로그인으로 폴백
          try {
            await signInAnonymously(authInstance);
          } catch (e) {
            console.error("Anonymous authentication fallback failed:", e);
          }
        }
      };
      
      signIn();
      return () => authListener();

    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setLoading(false);
    }
  }, []);

  // Google Sheets에서 뉴스 데이터 가져오기
  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const encodedSheetName = encodeURIComponent(SHEET_NAME);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodedSheetName}?key=${GOOGLE_SHEETS_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Google Sheets API Error: ${response.status} - ${errorData.error.message}`
        );
      }

      const data = await response.json();
      const rows = data.values;
      if (!rows || rows.length <= 1)
        throw new Error("No data found in Google Sheets.");

      const dataRows = rows.slice(1);
      const parsedNews = dataRows
        .map((row, index) => {
          let dateTime = row[5] || new Date().toISOString().split("T")[0];
          let datePart = dateTime;
          let timePart = "";
          if (dateTime.includes(" ")) {
            const [d, t] = dateTime.split(" ");
            datePart = d;
            timePart = t;
          }

          return {
            id: `news-${index}`,
            title: row[0] || "",
            keyword: row[1] || "",
            source: row[2] || "",
            tags: row[3] || "",
            url: row[4] || "",
            date: datePart,
            time: timePart || "00:00",
            summary: row[6] || "",
            content: row[7] || "",
            imageUrl: row[8] || "",
            nickname: row[9] || "",
            companyName: row[10] || "",
            jobTitle: row[11] || "",
            recommendationStrength: parseInt(row[12]) || 0,
            recommendationReason: row[13] || "",
            likes: parseInt(row[14]) || 0,
          };
        })
        .filter((news) => news.title);

      setNewsData(parsedNews);
      if (parsedNews.length > 0) {
        const latest = parsedNews.sort(
          (a, b) =>
            new Date(`${b.date}T${b.time}`) -
            new Date(`${a.date}T${a.time}`)
        )[0].date;
        setLatestDate(latest);
      }
    } catch (err) {
      console.error("Failed to fetch from Google Sheets:", err);
    } finally {
      setLoading(false);
    }
  }, [SHEET_ID, SHEET_NAME, GOOGLE_SHEETS_API_KEY]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Firestore에서 북마크 데이터 실시간 리스너 설정
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const bookmarksCollectionRef = collection(
      db,
      `artifacts/${appId}/users/${userId}/bookmarks`
    );
    const unsubscribeBookmarks = onSnapshot(
      query(bookmarksCollectionRef),
      (snapshot) => {
        const fetchedBookmarks = new Set(
          snapshot.docs.map((doc) => doc.data().newsId)
        );
        setBookmarkedNewsIds(fetchedBookmarks);
      },
      (error) => {
        console.error("Failed to listen to bookmarks:", error);
      }
    );

    return () => {
      unsubscribeBookmarks();
    };
  }, [db, userId, isAuthReady, appId]);

  // 북마크 추가/제거 토글 함수
  const toggleBookmark = async (newsId) => {
    if (!db || !userId) return;
    const bookmarksCollectionRef = collection(
      db,
      `artifacts/${appId}/users/${userId}/bookmarks`
    );
    try {
      if (bookmarkedNewsIds.has(newsId)) {
        // 북마크 제거
        const q = query(bookmarksCollectionRef, where("newsId", "==", newsId));
        const snapshot = await getDocs(q);
        snapshot.forEach((d) =>
          deleteDoc(
            doc(
              db,
              `artifacts/${appId}/users/${userId}/bookmarks`,
              d.id
            )
          )
        );
      } else {
        // 북마크 추가
        await addDoc(bookmarksCollectionRef, {
          newsId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("Bookmark toggle failed: ", e);
    }
  };

  // 탭에 따라 뉴스 데이터 필터링
  const filteredNewsData = newsData.filter((news) => {
    if (activeTab === "recommended") return news.tags?.includes("추천");
    if (activeTab === "bookmarks") return bookmarkedNewsIds.has(news.id);
    if (activeTab === "subscribe")
      return (
        news.nickname &&
        news.companyName &&
        news.jobTitle &&
        news.recommendationReason &&
        news.recommendationStrength > 0
      );
    return true;
  });

  // 시간을 기준으로 뉴스 그룹화
  const groupNewsByHour = (newsItems) => {
    return newsItems.reduce((acc, news) => {
      const newsDateTime = new Date(`${news.date}T${news.time}`);
      const groupKey =
        newsDateTime.getFullYear() +
        "-" +
        (newsDateTime.getMonth() + 1).toString().padStart(2, "0") +
        "-" +
        newsDateTime.getDate().toString().padStart(2, "0") +
        " " +
        newsDateTime.getHours().toString().padStart(2, "0") +
        "시";

      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(news);
      return acc;
    }, {});
  };

  const groupedNews = groupNewsByHour(filteredNewsData);
  const sortedGroups = Object.keys(groupedNews).sort(
    (a, b) =>
      new Date(a.replace("시", "").trim()) - new Date(b.replace("시", "").trim())
  ).reverse();

  // 그룹 헤더 포맷팅 (년-월-일 오전/오후 시)
  const formatGroupHeader = (groupKey) => {
    const [datePart, hourPart] = groupKey.split(" ");
    const date = new Date(datePart);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hour24 = parseInt(hourPart);
    const ampm = hour24 >= 12 ? "오후" : "오전";
    const hour12 = hour24 % 12 || 12;
    return `${year}-${month}-${day} ${ampm} ${hour12}시`;
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="sticky top-0 bg-white shadow-sm z-20">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Newspaper className="text-blue-600 w-7 h-7" />
            <h1 className="text-2xl font-bold text-gray-900">키워드뉴스</h1>
          </div>
          {latestDate && (
            <span className="text-gray-500 text-sm self-center">
              업데이트: {latestDate}
            </span>
          )}
        </div>
        <div className="flex justify-start border-b border-gray-200 bg-gray-50 px-4">
          {["all", "recommended", "subscribe", "bookmarks"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
              }}
              className={`py-3 px-5 text-base font-semibold transition-colors duration-200 ${
                activeTab === tab
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
              }`}
            >
              {tab === "recommended"
                ? "추천"
                : tab === "all"
                ? "전체"
                : tab === "bookmarks"
                ? "북마크"
                : tab === "subscribe"
                ? "구독"
                : "관리"}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 sm:p-6">
        {loading && (
          <div className="text-center text-gray-500 p-8">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>뉴스 데이터를 불러오는 중...</p>
          </div>
        )}
        {!loading &&
          (sortedGroups.length > 0 ? (
            sortedGroups.map((groupKey) => (
              <section
                key={groupKey}
                className="max-w-4xl mx-auto mb-8"
              >
                <h2 className="text-lg font-bold text-gray-700 mb-3 pl-2 border-l-4 border-blue-500">
                  {formatGroupHeader(groupKey)}
                </h2>
                <div className="space-y-4">
                  {groupedNews[groupKey].map((news) => (
                    <Card key={news.id} className="p-4 bg-white">
                      <div className="flex justify-between items-start gap-4">
                        <h3 className="text-base font-semibold text-gray-800 flex-grow">
                          {news.title}
                        </h3>
                        <button
                          onClick={() => toggleBookmark(news.id)}
                          className="p-2 rounded-full hover:bg-yellow-100 transition-colors flex-shrink-0"
                        >
                          <Star
                            size={22}
                            className={
                              bookmarkedNewsIds.has(news.id)
                                ? "text-yellow-500 fill-current"
                                : "text-gray-400 hover:text-yellow-500"
                            }
                          />
                        </button>
                      </div>
                      <div className="flex items-start gap-4 mt-2">
                        {news.imageUrl && (
                          <img
                            src={news.imageUrl}
                            alt={news.title}
                            className="w-24 h-20 object-cover rounded-md flex-shrink-0"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = `https://placehold.co/96x80/E2E8F0/64748B?text=No+Image`;
                            }}
                          />
                        )}
                        <p className="flex-grow text-gray-700 text-sm leading-relaxed">
                          {news.summary}
                        </p>
                      </div>
                      <div className="flex justify-between items-center text-sm text-gray-600 mt-4 pt-3 border-t border-gray-100">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <span className="bg-gray-100 px-2 py-1 rounded-md font-medium">
                            {news.keyword}
                          </span>
                          <span>{news.source}</span>
                          {news.url && (
                            <a
                              href={news.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            >
                              <ExternalLink size={14} />원문 보기
                            </a>
                          )}
                          <span className="text-gray-500 text-xs flex-shrink-0">
                            {news.date} {news.time}
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="text-center text-gray-500 p-8">
              <p>표시할 뉴스가 없습니다.</p>
            </div>
          ))}
      </main>
    </div>
  );
};

export default ITNewsApp;
