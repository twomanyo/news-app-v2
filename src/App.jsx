import React, { useState, useEffect, useCallback } from "react";
import { SHEET_ID, SHEET_NAME, API_KEY } from "./config";
import "./index.css";

const BASE_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A:N?key=${API_KEY}`;

// Mock 리뷰 데이터
const mockReviews = {
  '네이버': {
    rating: 4.8, count: 128,
    comments: [
      { company: '카카오', job: '기획', nickname: '라이언', rating: 5.0, text: '네이버의 업데이트는 항상 퀄리티가 높네요. 잘 봤습니다.' },
      { company: '토스', job: '개발', nickname: '익명', rating: 4.5, text: '유저 경험을 해치지 않는 선에서 잘 조절한 것 같아요.' }
    ]
  },
  '토스': {
    rating: 4.6, count: 81,
    comments: [
      { company: '네이버', job: '커머스', nickname: 'neo', rating: 4.5, text: '토스의 행보는 정말 파격적이네요. 시장에 큰 영향을 줄 것 같습니다.' },
      { company: '쿠팡', job: '마케터', nickname: '쿠팡맨', rating: 4.0, text: '결국 수익 모델로 전환하겠지만, 지금은 트래픽 확보가 우선이겠죠.' }
    ]
  },
  '당근': {
    rating: 4.0, count: 55,
    comments: [
      { company: '배민', job: '사업개발', nickname: 'B마트', rating: 4.0, text: '동네생활 탭의 활용도를 높이려는 시도가 좋네요.' }
    ]
  },
  'Google': {
    rating: 4.9, count: 210,
    comments: [
      { company: '네이버', job: 'AI 기획', nickname: '클로바', rating: 5.0, text: '대화형 검색은 역시 구글이네요. Grounding 기술이 인상적입니다.' }
    ]
  },
  '카카오': {
    rating: 4.2, count: 30,
    comments: [
      { company: '라인', job: '개발', nickname: '브라운', rating: 4.5, text: '카카오의 새로운 시도네요.' },
      { company: '네이버', job: '기획', nickname: '제이', rating: 4.0, text: 'GPT를 활용한 점이 인상깊습니다.' }
    ]
  },
  '쿠팡': {
    rating: 4.1, count: 45,
    comments: [
      { company: '배민', job: '물류', nickname: '배달이', rating: 4.0, text: '쿠팡이츠의 퀵커머스 확장이네요.' }
    ]
  }
};

// 회사별 스타일 반환
function getCompanyStyling(company) {
  const key = (company || '').toLowerCase();
  if (key.includes('naver') || key.includes('네이버')) return { icon: 'N', bg: 'bg-green-500', tag: 'tag-naver' };
  if (key.includes('toss') || key.includes('토스')) return { icon: 'T', bg: 'bg-blue-600', tag: 'tag-toss' };
  if (key.includes('daangn') || key.includes('당근')) return { icon: '🥕', bg: 'bg-orange-500', tag: 'tag-danggeun' };
  if (key.includes('google') || key.includes('구글')) return { icon: 'G', bg: 'bg-red-600', tag: 'tag-google' };
  if (key.includes('kakao') || key.includes('카카오')) return { icon: 'K', bg: 'bg-yellow-400', tag: 'tag-default' };
  if (key.includes('coupang') || key.includes('쿠팡')) return { icon: 'C', bg: 'bg-red-700', tag: 'tag-coupang' };
  
  const firstLetter = (company && company.length > 0) ? company[0] : '?';
  return { icon: firstLetter, bg: 'bg-gray-500', tag: 'tag-default' };
}

// YouTube URL에서 썸네일과 ID 추출
function getYouTubeInfo(url) {
  if (!url) return null;
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  const videoId = match ? match[1] : null;
  if (videoId) {
    return {
      id: videoId,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
  return null;
}

const ITServiceFeedApp = () => {
  // 뷰 상태
  const [currentView, setCurrentView] = useState('main'); // 'main', 'timeline', 'detail', 'signup'
  const [selectedFeedId, setSelectedFeedId] = useState(null);
  const [timelineServiceKey, setTimelineServiceKey] = useState(null);
  const [timelineServiceName, setTimelineServiceName] = useState('');

  // 필터 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [companyTag, setCompanyTag] = useState('');
  const [onlyAI, setOnlyAI] = useState(false);

  // 데이터 상태
  const [allFeedData, setAllFeedData] = useState({});
  const [allTimelineData, setAllTimelineData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 사용자 상태
  const [mockUser, setMockUser] = useState({
    isLoggedIn: false,
    nickname: '',
    company: '',
    job: ''
  });

  // 모달 상태
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewerImageSrc, setViewerImageSrc] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRadarModal, setShowRadarModal] = useState(false);
  const [showAuthMenu, setShowAuthMenu] = useState(false);
  const [radarActiveFeeds, setRadarActiveFeeds] = useState(new Set());

  // Google Sheets 데이터 페칭
  const fetchFeedData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(BASE_URL);
      if (!response.ok) throw new Error(`Google Sheets API Error: ${response.statusText}`);

      const data = await response.json();
      if (!data.values || data.values.length < 2) throw new Error("시트에 데이터가 없습니다.");

      let processedFeeds = data.values.slice(1).map((row, index) => {
        const company = (row[0] || 'Unknown').trim();
        const service = (row[1] || 'Service').trim();
        const feedId = `feed-${company}${service}${index}`;
        const serviceKey = `${company}_${service}`;

        const tags = [row[2], row[3]].filter(Boolean).map(t => t.trim());
        const imageUrls = [row[9], row[10]].filter(Boolean).map(url => url.trim());

        return {
          id: feedId,
          reviewKey: company,
          serviceKey: serviceKey,
          company: company,
          service: service,
          date: row[4] || '날짜 미정',
          title: row[5] || '제목 없음',
          updateContent: row[6] || '',
          changePurpose: row[7] || '',
          insight: row[8] || '',
          videoUrl: (row[11] && row[11].trim()) ? row[11].trim() : null,
          isAI: (row[13] || '').trim().toLowerCase() === 'ai',
          tags: tags,
          imageUrls: imageUrls,
          rowIndex: index
        };
      });

      // 데이터 입력 순서의 역순으로 정렬
      processedFeeds.sort((a, b) => b.rowIndex - a.rowIndex);

      // 글로벌 데이터 저장소 업데이트
      const feedDataMap = {};
      processedFeeds.forEach(feed => {
        feedDataMap[feed.id] = feed;
      });

      // 타임라인 데이터 그룹화
      const timelineDataMap = {};
      processedFeeds.forEach(feed => {
        if (!timelineDataMap[feed.serviceKey]) {
          timelineDataMap[feed.serviceKey] = [];
        }
        timelineDataMap[feed.serviceKey].push(feed);
      });

      setAllFeedData(feedDataMap);
      setAllTimelineData(timelineDataMap);
    } catch (err) {
      console.error("데이터 로딩 실패:", err);
      setError(`피드 로딩 실패! Google Sheets API 또는 네트워크 연결을 확인해주세요. 오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedData();
  }, [fetchFeedData]);

  // 필터링된 피드 목록
  const filteredFeeds = Object.values(allFeedData).filter(feed => {
    const query = searchQuery.toLowerCase();
    const feedContent = `${feed.title} ${feed.updateContent} ${feed.insight}`.toLowerCase();
    const matchesSearch = feedContent.includes(query);
    const matchesCompany = !companyTag || feed.company === companyTag;
    const matchesAI = !onlyAI || feed.isAI;
    return matchesSearch && matchesCompany && matchesAI;
  });

  // 회사 목록
  const companies = [...new Set(Object.values(allFeedData).map(feed => feed.company).filter(Boolean))];

  // 뷰 전환 함수들
  const showFeedList = () => {
    setCurrentView('main');
    setSelectedFeedId(null);
    setTimelineServiceKey(null);
  };

  const showTimelineView = (serviceKey, serviceName) => {
    setCurrentView('timeline');
    setTimelineServiceKey(serviceKey);
    setTimelineServiceName(serviceName);
  };

  const showDetailView = (feedId) => {
    setCurrentView('detail');
    setSelectedFeedId(feedId);
  };

  const showSignupView = () => {
    setCurrentView('signup');
  };

  // 레이더 클릭 핸들러
  const handleRadarClick = (feedId) => {
    if (!mockUser.isLoggedIn) {
      setShowLoginModal(true);
      return;
    }
    setShowRadarModal(true);
    setRadarActiveFeeds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(feedId)) {
        newSet.delete(feedId);
      } else {
        newSet.add(feedId);
      }
      return newSet;
    });
  };

  // 회사 태그 클릭 핸들러
  const handleCompanyTagClick = (companyName) => {
    setCompanyTag(companyName === companyTag ? '' : companyName);
  };

  // 리뷰 HTML 생성 함수
  const getReviewHtml = (reviewKey, feedId, isExpandedDefault = false) => {
    let reviewData = null;
    const key = (reviewKey || '').toLowerCase();
    
    if (key.includes('naver') || key.includes('네이버')) reviewData = mockReviews['네이버'];
    else if (key.includes('toss') || key.includes('토스')) reviewData = mockReviews['토스'];
    else if (key.includes('daangn') || key.includes('당근')) reviewData = mockReviews['당근'];
    else if (key.includes('google') || key.includes('구글')) reviewData = mockReviews['Google'];
    else if (key.includes('kakao') || key.includes('카카오')) reviewData = mockReviews['카카오'];
    else if (key.includes('coupang') || key.includes('쿠팡')) reviewData = mockReviews['쿠팡'];

    if (!reviewData) return null;

    if (isExpandedDefault) {
      // 상세 뷰 - 풀 목업
      return (
        <div>
          <hr className="my-4 border-gray-200" />
          <div className="review-lite-container">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-yellow-500">⭐️</span>
              <span className="font-bold text-gray-800">4.3 점</span>
              <span className="text-sm text-gray-500">(총 평가 32 개)</span>
            </div>
            
            <div className="mt-6 p-4 border rounded-lg bg-gray-50">
              <h4 className="font-semibold text-gray-800 mb-2">리뷰 작성하기</h4>
              <div className="star-rating mb-2">
                <input type="radio" id={`star5-${feedId}`} name={`rating-${feedId}`} value="5" />
                <label htmlFor={`star5-${feedId}`}>★</label>
                <input type="radio" id={`star4-${feedId}`} name={`rating-${feedId}`} value="4" />
                <label htmlFor={`star4-${feedId}`}>★</label>
                <input type="radio" id={`star3-${feedId}`} name={`rating-${feedId}`} value="3" />
                <label htmlFor={`star3-${feedId}`}>★</label>
                <input type="radio" id={`star2-${feedId}`} name={`rating-${feedId}`} value="2" />
                <label htmlFor={`star2-${feedId}`}>★</label>
                <input type="radio" id={`star1-${feedId}`} name={`rating-${feedId}`} value="1" />
                <label htmlFor={`star1-${feedId}`}>★</label>
              </div>
              <textarea className="w-full p-2 border rounded-md text-sm" rows="3" placeholder="의견을 남겨주세요..."></textarea>
              <button onClick={() => handleReviewSubmit()} 
                      className="w-full mt-2 bg-indigo-500 text-white font-semibold text-sm px-3 py-2 rounded-md hover:bg-indigo-600 shadow-sm">
                댓글 등록
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-end mb-2">
                  <span className="text-xs font-bold text-gray-600 flex items-center">
                    <span className="text-yellow-500 mr-1">⭐️</span>
                    4.0
                  </span>
                </div>
                <p className="text-sm text-gray-700">
                  기대되는 기능이네요
                  <span className="text-xs text-gray-500 ml-1">(카카오 _ 사업 _ 라이언)</span>
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-end mb-2">
                  <span className="text-xs font-bold text-gray-600 flex items-center">
                    <span className="text-yellow-500 mr-1">⭐️</span>
                    4.5
                  </span>
                </div>
                <p className="text-sm text-gray-700">
                  이 기능은 저희도 검토했었는데, 아마존이 먼저 출시했군요. 잘 봤습니다.
                  <span className="text-xs text-gray-500 ml-1">(네이버 _ 기획 _ 제이)</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 목록 뷰 - 요약 목업
    const firstComment = reviewData.comments[0];
    if (!firstComment) return null;

    let commentText = firstComment.text;
    if (commentText.length > 40) {
      commentText = commentText.substring(0, 40) + "...";
    }
    
    const commentAuthor = `${firstComment.company} _ ${firstComment.job} _ ${firstComment.nickname}`;

    return (
      <div>
        <hr className="my-4 border-gray-200" />
        <div className="review-summary-container">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-500">⭐️</span>
            <span className="font-bold text-gray-800 text-sm">{reviewData.rating} 점</span>
            <span className="text-sm text-gray-500">(총 평가 {reviewData.count} 개)</span>
          </div>
          <div className="text-sm text-gray-700">
            <p className="truncate">
              "{commentText}"
              <span className="text-xs text-gray-500 ml-1">({commentAuthor})</span>
            </p>
          </div>
        </div>
      </div>
    );
  };

  // 리뷰 등록 핸들러
  const handleReviewSubmit = () => {
    if (!mockUser.isLoggedIn) {
      setShowLoginModal(true);
      return;
    }
    alert('✅ 리뷰가 등록되었습니다! (모의)');
  };

  // 가입 처리
  const handleSignup = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const nickname = formData.get('nickname');
    const company = formData.get('company');
    const job = formData.get('job');

    if (!nickname || !company || !job) {
      alert('모든 항목을 입력해주세요.');
      return;
    }
    
    setMockUser({
      isLoggedIn: true,
      nickname: nickname,
      company: company,
      job: job
    });
    
    e.target.reset();
    showFeedList();
  };

  // 인증 액션 핸들러
  const handleAuthAction = (action) => {
    setShowAuthMenu(false);
    if (action === 'login') {
      setShowLoginModal(true);
    } else if (action === 'join') {
      showSignupView();
    } else if (action === 'logout') {
      setMockUser({ isLoggedIn: false, nickname: '', company: '', job: '' });
    }
  };

  // 이미지 뷰어 열기
  const openImageViewer = (imgSrc) => {
    setViewerImageSrc(imgSrc);
    setShowImageViewer(true);
    document.body.style.overflow = 'hidden';
  };

  // 이미지 뷰어 닫기
  const closeImageViewer = () => {
    setShowImageViewer(false);
    document.body.style.overflow = '';
  };

  // 동영상 미리보기 HTML 생성
  const getVideoPreviewHtml = (url, feedId) => {
    const videoInfo = getYouTubeInfo(url);
    if (!videoInfo) {
      if (url) {
        return (
          <a href={url} target="_blank" rel="noopener noreferrer" 
             className="block p-4 bg-gray-100 text-indigo-600 font-semibold rounded-lg text-center hover:bg-gray-200" 
             title="새 창에서 동영상 재생">
            🔗 동영상 원본 보기 (새 창)
          </a>
        );
      }
      return null;
    }

    return (
      <a href={url} target="_blank" rel="noopener noreferrer" 
         className="video-thumbnail-preview" title="새 창에서 동영상 재생">
        <img src={videoInfo.thumbnail} alt={`${feedId} 동영상 미리보기`} loading="lazy" />
        <div className="video-play-icon">
          <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 3l12 9-12 9V3z"/>
          </svg>
        </div>
      </a>
    );
  };

  // 피드 포커스 함수
  const goToFeedAndFocus = (feedId) => {
    showFeedList();
    setSearchQuery('');
    setCompanyTag('');
    setOnlyAI(false);
    
    setTimeout(() => {
      const feedElement = document.getElementById(feedId);
      if (feedElement) {
        feedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        feedElement.style.transition = 'background-color 0.5s ease-out';
        feedElement.style.backgroundColor = '#f0f9ff';
        setTimeout(() => {
          feedElement.style.backgroundColor = '#ffffff';
        }, 2000);
      }
    }, 100);
  };

  // 피드 카드 렌더링
  const renderFeedCard = (feed) => {
    const styling = getCompanyStyling(feed.company);
    const tagHtml = feed.tags.map(tag => (
      <span key={tag} className={`tag ${styling.tag}`}>#{tag}</span>
    ));

    const currentImageUrl = feed.imageUrls[0] || '';
    const mediaHtml = currentImageUrl ? (
      <div className="mb-4 rounded-lg overflow-hidden border border-gray-200 relative">
        <img src={currentImageUrl}
             alt={`${feed.title} 이미지`} 
             className="feed-image"
             onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/600x300/e5e7eb/374151?text=No+Image'; }}
             onClick={() => openImageViewer(currentImageUrl)} 
             loading="lazy" />
      </div>
    ) : (
      <div className="mb-4 text-center p-8 text-gray-400 border border-gray-200 rounded-lg">첨부된 이미지가 없습니다.</div>
    );

    const reviewHtml = getReviewHtml(feed.reviewKey, feed.id, false);
    const maxInitialHeight = 144; // 9rem
    const shouldShowMoreButton = feed.changePurpose || feed.imageUrls?.length > 1 || feed.videoUrl || 
      (feed.updateContent && feed.updateContent.split('\n').length > 6);

    return (
      <div key={feed.id}
           className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 feed-card"
           id={feed.id}>
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 mb-4">
          <div className="flex items-center cursor-pointer hover:opacity-75 transition-opacity"
               onClick={() => showTimelineView(feed.serviceKey, `${feed.company} _ ${feed.service}`)}>
            <div className={`w-10 h-10 ${styling.bg} rounded-full flex items-center justify-center text-white text-xl font-bold mr-3`}>
              {styling.icon}
            </div>
            <div>
              <p className="font-semibold text-gray-800">
                {feed.company} _ {feed.service}
                <span className="text-indigo-600 text-xs font-bold ml-1 align-middle leading-none">히스토리 &gt;</span>
              </p>
              <p className="text-xs text-gray-500">{feed.date} 업데이트</p>
            </div>
          </div>

          <svg onClick={() => handleRadarClick(feed.id)}
               className={`w-6 h-6 radar-icon transform rotate-45 ${radarActiveFeeds.has(feed.id) ? 'active' : ''}`}
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856a9.75 9.75 0 0113.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 20.25a.75.75 0 100-1.5.75.75 0 000 1.5z"/>
          </svg>
        </div>

        <div className="flex justify-between items-start mb-2">
          <h2 className="text-xl font-bold text-gray-900 leading-tight pr-4">{feed.title}</h2>
        </div>

        <div className="flex justify-end mb-4">{tagHtml}</div>
        {mediaHtml}

        <div id={`content-${feed.id}`} className="content-container">
          <div id={`update-content-body-${feed.id}`}>
            <p className="text-left text-gray-700 text-sm mb-2 leading-relaxed whitespace-pre-wrap">{feed.updateContent}</p>
          </div>
        </div>

        {shouldShowMoreButton && (
          <div className="flex justify-end items-center mt-1">
            <button onClick={() => showDetailView(feed.id)}
                    className="text-indigo-500 hover:text-indigo-600 font-semibold text-sm">
              더보기
            </button>
          </div>
        )}

        {feed.insight && (
          <>
            <hr className="my-4 border-gray-200" />
            <div className="p-3 bg-transparent rounded-lg">
              <p className="text-sm font-bold text-gray-700 mb-1">한 줄 시사점:</p>
              <p className="text-sm text-gray-800">{feed.insight}</p>
            </div>
          </>
        )}

        {reviewHtml}
      </div>
    );
  };

  // 상세 뷰 렌더링
  const renderDetailView = () => {
    const feed = allFeedData[selectedFeedId];
    if (!feed) {
      return <p className="text-red-500">오류: 피드 정보를 불러올 수 없습니다.</p>;
    }

    const styling = getCompanyStyling(feed.company);
    const tagHtml = feed.tags.map(tag => (
      <span key={tag} className={`tag ${styling.tag}`}>#{tag}</span>
    ));

    const currentImageUrl = feed.imageUrls[0] || '';
    const mainMediaHtml = currentImageUrl ? (
      <div className="mb-6 rounded-lg overflow-hidden border border-gray-200">
        <img src={currentImageUrl} alt={`${feed.title} 이미지`}
             className="w-full h-auto max-h-[400px] object-contain bg-gray-50"
             onClick={() => openImageViewer(currentImageUrl)} loading="lazy"
             onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/600x300/e5e7eb/374151?text=No+Image'; }} />
      </div>
    ) : null;

    const videoPreviewHtml = feed.videoUrl ? getVideoPreviewHtml(feed.videoUrl, feed.id) : null;

    const otherImages = feed.imageUrls.slice(1);
    const otherImagesHtml = otherImages.length > 0 ? (
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-gray-800 mb-2">추가 이미지</h3>
        {otherImages.map((url, i) => (
          <img key={i} src={url} alt={`${feed.title} 첨부 이미지 ${i+2}`}
               className="feed-image-gallery rounded-lg shadow-sm"
               onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/600x200/e5e7eb/374151?text=Image+${i+2}+Error`; }}
               onClick={() => openImageViewer(url)} loading="lazy" />
        ))}
      </div>
    ) : null;

    const reviewHtml = getReviewHtml(feed.reviewKey, feed.id, true);

    return (
      <div className="pt-2">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-4">{feed.title}</h1>

        <div className="flex items-center gap-3 mb-2 text-sm text-gray-500">
          <span className={`w-6 h-6 ${styling.bg} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
            {styling.icon}
          </span>
          <span className="font-semibold text-gray-700">{feed.company} _ {feed.service}</span>
          <span>&bull;</span>
          <span>{feed.date}</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-6">
          {tagHtml}
        </div>

        {mainMediaHtml}

        <div className="mb-6 content-container p-4 bg-white rounded-lg border">
          <h3 className="text-sm font-bold text-gray-800 mb-2 border-b pb-1">내용 설명</h3>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{feed.updateContent}</p>
        </div>

        {feed.changePurpose && (
          <div className="p-4 bg-white rounded-lg mb-6 border">
            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b pb-1">변경 목적</h3>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{feed.changePurpose}</p>
          </div>
        )}

        <div className="mb-6 space-y-6">
          {videoPreviewHtml}
          {otherImagesHtml}
        </div>

        {feed.insight && (
          <>
            <hr className="my-6 border-gray-200" />
            <div className="p-4 bg-white rounded-lg mb-6 border">
              <p className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">한 줄 시사점:</p>
              <p className="text-sm text-gray-800 leading-relaxed">{feed.insight}</p>
            </div>
          </>
        )}

        {reviewHtml}
      </div>
    );
  };

  // 타임라인 뷰 렌더링
  const renderTimelineView = () => {
    const history = timelineServiceKey ? (allTimelineData[timelineServiceKey] || []) : [];

    if (history.length === 0) {
      return <p className="text-gray-500">이전 히스토리가 없습니다.</p>;
    }

    return history.map(feed => {
      const fullContent = (feed.updateContent || '');
      const maxLines = 10;
      const maxChars = 600;

      let summaryLines = fullContent.split('\n').slice(0, maxLines);
      let summary = summaryLines.join('\n');

      let wasTruncatedByLines = fullContent.split('\n').length > maxLines;
      let wasTruncatedByChars = false;

      if (summary.length > maxChars) {
        summary = summary.substring(0, maxChars);
        wasTruncatedByChars = true;
      }

      if (wasTruncatedByLines || wasTruncatedByChars) {
        summary += '...';
      }

      return (
        <div key={feed.id} className="relative pl-8 pb-6 border-l-2 border-gray-200">
          <span className="absolute -left-2 top-1 w-3.5 h-3.5 bg-indigo-500 rounded-full border-2 border-white"></span>
          <p className="text-xs text-gray-500 mb-1">{feed.date}</p>
          <h3 className="text-lg font-semibold text-gray-800">{feed.title}</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{summary}</p>
          <button onClick={() => goToFeedAndFocus(feed.id)}
                  className="text-indigo-500 hover:text-indigo-600 font-semibold text-sm mt-2">
            피드에서 더보기 &rarr;
          </button>
        </div>
      );
    });
  };

  return (
    <div className="p-4 md:p-8">
      {/* 이미지 뷰어 모달 */}
      {showImageViewer && (
        <div className="image-viewer" onClick={closeImageViewer}>
          <span className="close-btn hover:text-gray-300" onClick={closeImageViewer}>&times;</span>
          <img src={viewerImageSrc} alt="확대 이미지" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* 로그인 필요 모달 */}
      {showLoginModal && (
        <div className="login-required-modal" onClick={() => setShowLoginModal(false)}>
          <div className="bg-white p-8 rounded-xl shadow-2xl max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <svg className="w-16 h-16 text-indigo-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
              </svg>
              <h3 className="text-lg font-bold text-gray-900 mb-2">알림</h3>
              <p className="text-gray-600 mb-6">로그인 후 이용해주세요.</p>
              <button onClick={() => setShowLoginModal(false)}
                      className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 레이더 알림 모달 */}
      {showRadarModal && (
        <div className="radar-alert-modal" onClick={() => setShowRadarModal(false)}>
          <div className="bg-white p-8 rounded-xl shadow-2xl max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <span className="text-5xl" role="img" aria-label="satellite">🛰️</span>
              <h3 className="text-lg font-bold text-gray-900 mt-4 mb-2">알림</h3>
              <p className="text-gray-600 mb-6">서비스 업데이트 탐지를 시작합니다.</p>
              <button onClick={() => setShowRadarModal(false)}
                      className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 로딩 스피너 */}
      {loading && (
        <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
          <div className="spinner"></div>
          <p className="ml-3 text-gray-600">피드를 불러오는 중...</p>
        </div>
      )}

      {/* 메인 뷰 */}
      {currentView === 'main' && (
        <div id="main-view">
          <header className="mb-6 relative max-w-3xl mx-auto">
            <div className="flex justify-center items-center relative pt-4">
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-gray-800 mb-2">
                  <span className="mr-2 text-indigo-600">📡</span>Launched Detected
                </h1>
              </div>
              
              <div className="absolute top-4 right-0">
                <button onClick={() => setShowAuthMenu(!showAuthMenu)} 
                        className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                  </svg>
                </button>
                {showAuthMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20">
                    <div className="py-1">
                      {mockUser.isLoggedIn ? (
                        <a href="#" onClick={(e) => { e.preventDefault(); handleAuthAction('logout'); }} 
                           className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">로그아웃</a>
                      ) : (
                        <>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleAuthAction('login'); }} 
                             className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">로그인</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleAuthAction('join'); }} 
                             className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">회원가입</a>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {mockUser.isLoggedIn && (
              <div className="mt-4">
                <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-lg">
                  <p className="font-bold">환영합니다, {mockUser.nickname}님!</p>
                  <p className="text-sm">({mockUser.company} / {mockUser.job}) 정보로 가입되었습니다.</p>
                </div>
              </div>
            )}
          </header>

          <main className="max-w-3xl mx-auto">
            <div className="space-y-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="relative flex-grow">
                  <input type="text" 
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                         placeholder="피드 검색 (제목, 내용, 시사점 포함)"
                         className="w-full p-3 pl-10 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-sm" />
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
                <button onClick={() => setOnlyAI(!onlyAI)}
                        className={`ai-filter-button ${onlyAI ? 'active' : ''}`}>
                  AI ✨
                </button>
              </div>

              <div className="company-tag-cloud-wrapper w-full">
                <div className="flex gap-2 w-max">
                  {companies.map(company => {
                    const styling = getCompanyStyling(company);
                    return (
                      <button key={company}
                              className={`company-tag ${styling.tag} ${companyTag === company ? 'active' : ''}`}
                              onClick={() => handleCompanyTagClick(company)}>
                        #{company}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {error && (
              <div className="text-center p-10 bg-red-100 text-red-700 rounded-lg">
                <p className="font-bold">⚠️ 피드 로딩 실패!</p>
                <p className="text-sm">Google Sheets API 또는 네트워크 연결을 확인해주세요.</p>
                <p className="text-xs mt-2">오류: {error}</p>
              </div>
            )}

            {!loading && !error && filteredFeeds.length === 0 && (
              <div className="text-center p-10 bg-yellow-100 text-yellow-700 rounded-lg">
                <p className="font-bold">표시할 피드 데이터가 없습니다.</p>
              </div>
            )}

            <div id="feeds-list" className="space-y-8">
              {filteredFeeds.map(feed => renderFeedCard(feed))}
            </div>
          </main>

          <footer className="text-center text-sm text-gray-400 mt-10 p-4">
            &copy; 2025 IT Service Update Feed
          </footer>
        </div>
      )}

      {/* 타임라인 뷰 */}
      {currentView === 'timeline' && (
        <section id="timeline-view" className="max-w-3xl mx-auto p-4 md:p-8">
          <header className="mb-4 pb-4 border-b">
            <button onClick={showFeedList} className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">
              &larr; 피드 목록으로 돌아가기
            </button>
          </header>

          <h2 className="text-2xl font-bold text-gray-900 my-6">
            {timelineServiceName} 히스토리
          </h2>

          <div className="space-y-6">
            {renderTimelineView()}
            <div className="relative pl-8">
              <span className="absolute -left-2 top-1 w-3.5 h-3.5 bg-gray-300 rounded-full border-2 border-white"></span>
            </div>
          </div>
        </section>
      )}

      {/* 상세 페이지 뷰 */}
      {currentView === 'detail' && (
        <section id="detail-view" className="max-w-3xl mx-auto p-4 md:p-8">
          <header className="mb-4 pb-4 border-b">
            <button onClick={showFeedList} className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">
              &larr; 피드 목록으로 돌아가기
            </button>
          </header>

          <div className="mt-6">
            {renderDetailView()}
          </div>
        </section>
      )}

      {/* 회원가입 뷰 */}
      {currentView === 'signup' && (
        <section id="signup-view" className="max-w-3xl mx-auto p-4 md:p-8">
          <header className="mb-4 pb-4 border-b">
            <button onClick={showFeedList} className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">
              &larr; 피드 목록으로 돌아가기
            </button>
          </header>
          
          <div className="mt-6 bg-white p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">회원가입</h2>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label htmlFor="nickname" className="block text-sm font-medium text-gray-700">닉네임</label>
                <input type="text" id="nickname" name="nickname" required
                       className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-gray-700">회사명</label>
                <input type="text" id="company" name="company" required
                       className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div>
                <label htmlFor="job" className="block text-sm font-medium text-gray-700">직무</label>
                <select id="job" name="job" required
                        className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                  <option value="">직무를 선택하세요</option>
                  <option value="기획">기획</option>
                  <option value="사업">사업</option>
                  <option value="개발">개발</option>
                  <option value="디자인">디자인</option>
                  <option value="스탭">스탭</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <button type="submit" 
                      className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
                가입하기
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
};

export default ITServiceFeedApp;
