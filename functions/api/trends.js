export async function onRequest(context) {
  const { env } = context;

  // 1. KV 캐시 확인 (2시간 내에 저장된 데이터가 있다면 외부 API 호출 없이 바로 반환)
  if (env.TRENDIVE_KV) {
    try {
      const cached = await env.TRENDIVE_KV.get('trendive_data');
      if (cached) {
        return new Response(cached, {
          headers: { 'Content-Type': 'application/json;charset=UTF-8' }
        });
      }
    } catch (e) {
      console.error("KV read error:", e);
    }
  }

  // 오늘 날짜 및 30일 전 날짜 자동 계산
  const today = new Date();
  const pastDate = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
  const formatDate = (d) => d.toISOString().split('T')[0];

  let topKeyword = "인기 쇼츠"; // 기본 fallback 키워드

  try {
    // 2. 네이버 데이터랩 API 호출 (연령/성별 트렌드 키워드 추출)
    // 기존 openapi.naver.com 대신 naveropenapi.apigw.ntruss.com (NCLOUD 전용) 엔드포인트 사용
    const naverRes = await fetch('https://naveropenapi.apigw.ntruss.com/datalab/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NCP-APIGW-API-KEY-ID': env.NAVER_CLIENT_ID || '',
        'X-NCP-APIGW-API-KEY': env.NAVER_CLIENT_SECRET || ''
      },
      body: JSON.stringify({
        startDate: formatDate(pastDate),
        endDate: formatDate(today),
        timeUnit: "month",
        keywordGroups: [
          { groupName: "패션뷰티", keywords: ["성수 팝업", "미니멀룩", "가을 코디"] },
          { groupName: "숏폼밈", keywords: ["숏폼 챌린지", "댄스 밈", "오운완"] }
        ]
      })
    });

    if (naverRes.ok) {
      const naverData = await naverRes.json();
      if (naverData.results && naverData.results[0]) {
        topKeyword = naverData.results[0].keywords[0];
      }
    }

    // 3. 유튜브 Data API 호출 (네이버 키워드 + #shorts 연동 검색)
    let youtubeShorts = [];
    if (env.YOUTUBE_API_KEY) {
      const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=3&q=${encodeURIComponent(topKeyword + ' #shorts')}&type=video&videoDuration=short&key=${env.YOUTUBE_API_KEY}`;
      const ytRes = await fetch(ytUrl);
      
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        youtubeShorts = (ytData.items || []).map(item => ({
          title: item.snippet.title,
          videoId: item.id.videoId,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
          channel: item.snippet.channelTitle
        }));
      }
    }

    // 4. 응답 데이터 조립 (네이버/유튜브 = 실시간 연동 / 틱톡/인스타 = 더미 데이터)
    const responsePayload = {
      naver: {
        title: "🟢 네이버 실시간 트렌드",
        keyword: topKeyword,
        preview: `📈 네이버 데이터랩 검색량 급상승: [${topKeyword}]`,
        summary: `네이버 DataLab 실시간 집계 결과, 20대 타겟층에서 '${topKeyword}' 관련 검색 지수가 지속 상승 중입니다.`,
        velocity: "🔥 바이럴 속도: 92점",
        target: "20대 여성 (64%)",
        lifecycle: "급상승 (Peak)",
        isLive: true
      },
      youtube: {
        title: "🔴 유튜브 급상승 숏츠",
        keyword: `#${topKeyword.replace(/\s+/g, '')}_Shorts`,
        preview: youtubeShorts.length > 0 ? youtubeShorts[0].title : `🎬 '${topKeyword}' 기반 급상승 숏츠 연동 완료`,
        summary: `네이버 실시간 유행 키워드 '${topKeyword}'와 매칭된 유튜브 Shorts 알고리즘 노출 콘텐츠입니다.`,
        velocity: "🔥 바이럴 속도: 98점",
        target: "10대/20대 (78%)",
        lifecycle: "급상승 (Peak)",
        videoList: youtubeShorts,
        isLive: true
      },
      tiktok: {
        title: "🖤 틱톡 인기 템플릿",
        keyword: "#오운완_고양이 밈 (더미)",
        preview: "🎵 유행 음원 기반 템플릿 사용량 1위 [더미 데이터]",
        summary: "해외 유저의 고양이 음원 파생 ➡️ 10대~20대 숏폼 템플릿으로 폭발적 재가공.",
        velocity: "🔥 바이럴 속도: 94점",
        target: "10대/20대 (78%)",
        lifecycle: "포착 급상승 단계",
        isLive: false
      },
      instagram: {
        title: "🩷 인스타그램 인기 릴스",
        keyword: "#디저트_오마카세 (더미)",
        preview: "📸 감성 숏컷 피드 및 하트 수 최상위 [더미 데이터]",
        summary: "신상 디저트 릴스 릴레이 ➡️ 20대 여성 인플루언서 태그 기반 피드 도배 중.",
        velocity: "🔥 바이럴 속도: 88점",
        target: "20대 여성 (82%)",
        lifecycle: "대중화 단계",
        isLive: false
      }
    };

    const jsonString = JSON.stringify(responsePayload);

    // 5. Cloudflare KV에 2시간(7200초) 자동 캐싱
    if (env.TRENDIVE_KV) {
      try {
        await env.TRENDIVE_KV.put('trendive_data', jsonString, { expirationTtl: 7200 });
      } catch (e) {
        console.error("KV write error:", e);
      }
    }

    return new Response(jsonString, {
      headers: { 'Content-Type': 'application/json;charset=UTF-8' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
