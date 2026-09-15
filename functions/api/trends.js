export async function onRequest(context) {
  const { env } = context;

  // ============================================================
  // 1. KV CACHE
  // ============================================================

  if (env.TRENDIVE_KV) {
    try {
      const cached = await env.TRENDIVE_KV.get("trendive_data");

      if (cached) {
        return new Response(cached, {
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Cache-Control": "public, max-age=7200"
          }
        });
      }
    } catch (e) {
      console.error("KV read error:", e);
    }
  }

  // ============================================================
  // 2. DATE
  // ============================================================

  const today = new Date();

  const pastDate = new Date(
    today.getTime() - 30 * 24 * 60 * 60 * 1000
  );

  const formatDate = (date) =>
    date.toISOString().split("T")[0];

  const startDate = formatDate(pastDate);
  const endDate = formatDate(today);

  // ============================================================
  // 3. TREND KEYWORDS
  // ============================================================

  const keywordBatches = [
    [
      {
        category: "요아정/디저트",
        keywords: [
          "요아정",
          "두바이 초콜릿",
          "창억떡",
          "피자설기",
          "두쫀쿠"
        ]
      },
      {
        category: "게임",
        keywords: [
          "롤",
          "LOL",
          "발로란트",
          "LCK",
          "페이커",
          "오버워치",
          "롤토체스",
          "롤체",
          "TFT"
        ]
      },
      {
        category: "초등학생게임",
        keywords: [
          "브롤스타즈",
          "로블록스",
          "마인크래프트",
          "포켓몬",
          "쿠키런"
        ]
      },
      {
        category: "감성적인",
        keywords: [
          "감성",
          "힐링",
          "새벽감성",
          "플레이리스트",
          "노래추천"
        ]
      },
      {
        category: "헬스/런닝",
        keywords: [
          "헬스",
          "러닝",
          "런닝",
          "오운완",
          "마라톤"
        ]
      }
    ],

    [
      {
        category: "텍스트힙/문화",
        keywords: [
          "텍스트힙",
          "독서",
          "필사",
          "책추천",
          "전시회"
        ]
      },
      {
        category: "스포츠/도전",
        keywords: [
          "축구",
          "야구",
          "농구",
          "테니스",
          "등산"
        ]
      },
      {
        category: "생성형AI/테크",
        keywords: [
          "ChatGPT",
          "생성형AI",
          "AI",
          "클로드",
          "미드저니",
          "AI영상"
        ]
      },
      {
        category: "유치한",
        keywords: [
          "초딩",
          "병맛",
          "유치한",
          "킹받는",
          "밈"
        ]
      },
      {
        category: "성수팝업/핫플",
        keywords: [
          "성수",
          "성수 팝업",
          "팝업스토어",
          "서울 핫플",
          "데이트"
        ]
      }
    ],

    [
      {
        category: "숏드라마/엔터",
        keywords: [
          "숏드라마",
          "웹드라마",
          "드라마",
          "배우",
          "연예인"
        ]
      },
      {
        category: "저당/푸드",
        keywords: [
          "저당",
          "제로슈거",
          "다이어트",
          "단백질",
          "건강식"
        ]
      },
      {
        category: "Y2K/디카",
        keywords: [
          "Y2K",
          "디카",
          "디지털카메라",
          "필름카메라",
          "빈티지"
        ]
      },
      {
        category: "화장/뷰티",
        keywords: [
          "메이크업",
          "화장",
          "립",
          "쿠션",
          "퍼스널컬러"
        ]
      },
      {
        category: "버튜버/서브컬처",
        keywords: [
          "버튜버",
          "이세계아이돌",
          "홀로라이브",
          "애니",
          "덕질"
        ]
      }
    ],

    [
      {
        category: "저축/재테크",
        keywords: [
          "재테크",
          "저축",
          "주식",
          "ETF",
          "월급관리"
        ]
      },
      {
        category: "데스크테리어/테크",
        keywords: [
          "데스크테리어",
          "키보드",
          "마우스",
          "모니터",
          "맥북"
        ]
      },
      {
        category: "청음샵/라이프",
        keywords: [
          "청음샵",
          "헤드폰",
          "이어폰",
          "스피커",
          "오디오"
        ]
      },
      {
        category: "여자아이돌",
        keywords: [
          "여자아이돌",
          "아이브",
          "르세라핌",
          "에스파",
          "뉴진스",
          "장원영"
        ]
      },
      {
        category: "인디게임/게임",
        keywords: [
          "인디게임",
          "스팀게임",
          "신작게임",
          "공포게임",
          "로그라이크"
        ]
      }
    ]
  ];

  // ============================================================
  // 4. 모든 키워드를 개별 후보로 변환
  // ============================================================

  const candidates = [];

  for (const batch of keywordBatches) {
    for (const group of batch) {
      for (const keyword of group.keywords) {
        candidates.push({
          keyword,
          category: group.category
        });
      }
    }
  }

  // 중복 제거
  const uniqueCandidates = [
    ...new Map(
      candidates.map((item) => [item.keyword, item])
    ).values()
  ];

  // ============================================================
  // 5. Naver DataLab API
  //
  // DataLab은 요청당 keywordGroups 최대 5개
  // 따라서 5개씩 나눠서 요청
  // ============================================================

  const createChunks = (array, size) => {
    const result = [];

    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }

    return result;
  };

  const chunks = createChunks(uniqueCandidates, 5);

  // ============================================================
  // 6. Naver DataLab 요청 함수
  // ============================================================

  const fetchTrendBatch = async (chunk) => {
    // 각 키워드를 독립적인 keywordGroup으로 요청
    // Anchor를 사용하지 않고 개별 키워드의 원본 ratio를 사용
    const keywordGroups = chunk.map((item) => ({
      groupName: item.keyword,
      keywords: [item.keyword]
    }));

    try {
      const response = await fetch(
        "https://naveropenapi.apigw.ntruss.com/datalab/v1/search",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "X-NCP-APIGW-API-KEY-ID":
              env.NAVER_CLIENT_ID || "",
            "X-NCP-APIGW-API-KEY":
              env.NAVER_CLIENT_SECRET || ""
          },

          body: JSON.stringify({
            startDate: startDate,
            endDate: endDate,
            timeUnit: "date",
            keywordGroups: keywordGroups,
            device: "",
            ages: [],
            gender: ""
          })
        }
      );

      if (!response.ok) {
        console.error(
          "Naver DataLab error:",
          response.status,
          await response.text()
        );

        return [];
      }

      const data = await response.json();

      return data.results || [];

    } catch (error) {
      console.error(
        "Naver batch request failed:",
        error
      );

      return [];
    }
  };

  // ============================================================
  // 7. 모든 Batch 병렬 실행
  // ============================================================

  let batchResults = [];

  try {
    batchResults = await Promise.all(
      chunks.map((chunk) =>
        fetchTrendBatch(chunk)
      )
    );
  } catch (error) {
    console.error(
      "Parallel DataLab request error:",
      error
    );
  }

  const allResults = batchResults.flat();

  // ============================================================
  // 8. 카테고리 매핑
  // ============================================================

  const categoryMap = new Map();

  for (const item of uniqueCandidates) {
    categoryMap.set(
      item.keyword,
      item.category
    );
  }

  // ============================================================
  // 9. 날짜별 Trend 계산
  // ============================================================

  const trendScores = [];

  for (const result of allResults) {
    const keyword = result.title;

    if (!result.data || !result.data.length) {
      continue;
    }

    const sortedData = [...result.data].sort(
      (a, b) =>
        new Date(a.period) -
        new Date(b.period)
    );

    const values = sortedData.map(
      (item) =>
        Number(item.ratio) || 0
    );

    if (!values.length) {
      continue;
    }

    // ============================================================
    // 30일 평균
    // ============================================================

    const average30d =
      values.reduce(
        (sum, value) => sum + value,
        0
      ) / values.length;

    // ============================================================
    // 최근 7일
    // ============================================================

    const recent7 =
      values.slice(-7);

    const recent7d =
      recent7.length > 0
        ? recent7.reduce(
            (sum, value) => sum + value,
            0
          ) / recent7.length
        : 0;

    // ============================================================
    // 이전 기간
    // ============================================================

    const previousPeriod =
      values.slice(0, -7);

    const previousAverage =
      previousPeriod.length > 0
        ? previousPeriod.reduce(
            (sum, value) => sum + value,
            0
          ) / previousPeriod.length
        : 0;

    // ============================================================
    // 상승률 (%)
    // ============================================================

    let growthRate = 0;

    if (previousAverage > 0) {
      growthRate =
        ((recent7d - previousAverage) /
          previousAverage) *
        100;
    }

    // 지나치게 작은 기저값에서 발생하는
    // 비정상적인 폭등 방지
    growthRate = Math.max(
      -100,
      Math.min(300, growthRate)
    );

    // ============================================================
    // 최근 3일 평균
    // ============================================================

    const recent3 =
      values.slice(-3);

    const recent3d =
      recent3.length > 0
        ? recent3.reduce(
            (sum, value) => sum + value,
            0
          ) / recent3.length
        : 0;

    // ============================================================
    // 최신 값
    // ============================================================

    const latest =
      values[values.length - 1] || 0;

    // ============================================================
    // 최고점
    // ============================================================

    const peak =
      Math.max(...values);

    // ============================================================
    // 상태 라벨
    // ============================================================

    let status = "유지";

    if (growthRate >= 80) {
      status = "급상승";
    } else if (growthRate >= 25) {
      status = "상승";
    } else if (growthRate <= -25) {
      status = "하락";
    }

    // ============================================================
    // 10. 최종 점수 산출 및 데이터 구성
    // ============================================================

    // 상승률을 -100~300 범위에서 0~100으로 변환
    const normalizedGrowth =
      ((growthRate + 100) / 400) * 100;

    // ============================================================
    // 급상승 점수
    //
    // 상승률 50%
    // 최근 7일 관심도 30%
    // 최근 3일 모멘텀 20%
    // ============================================================

    const risingScore =
      normalizedGrowth * 0.5 +
      recent7d * 0.3 +
      recent3d * 0.2;

    // ============================================================
    // 전체 인기/안정 관심도 점수
    //
    // 주의:
    // Naver DataLab의 ratio는 각 키워드별로
    // 독립적으로 정규화된 값이므로
    // 절대 검색량 순위가 아님.
    //
    // 따라서 여기서는 "최근 30일 동안
    // 꾸준하게 높은 관심을 유지한 정도"를
    // 나타내는 지표로 사용.
    // ============================================================

    const stabilityBonus =
      Math.min(recent7d / 100, 1);

    const overallScore =
      average30d * 0.75 +
      recent7d * 0.25 +
      stabilityBonus;

    trendScores.push({
      keyword,

      category:
        categoryMap.get(keyword) ||
        "기타",

      // 프론트엔드 배지 노출용 상태 속성
      status,

      // 기본 지표
      average30d:
        Number(
          average30d.toFixed(2)
        ),

      recent7d:
        Number(
          recent7d.toFixed(2)
        ),

      recent3d:
        Number(
          recent3d.toFixed(2)
        ),

      latest:
        Number(
          latest.toFixed(2)
        ),

      peak:
        Number(
          peak.toFixed(2)
        ),

      previousAverage:
        Number(
          previousAverage.toFixed(2)
        ),

      growthRate:
        Number(
          growthRate.toFixed(2)
        ),

      // 최종 점수
      overallScore:
        Number(
          overallScore.toFixed(2)
        ),

      risingScore:
        Number(
          risingScore.toFixed(2)
        )
    });
  }

  // ============================================================
  // 11. 전체 인기순 TOP 10
  //
  // 엄밀한 절대 검색량 순위가 아니라
  // "30일간 안정적으로 높은 관심을 받은 순"
  // ============================================================

  const overallTop10 =
    [...trendScores]
      .sort(
        (a, b) =>
          b.overallScore -
          a.overallScore
      )
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        ...item
      }));

  // ============================================================
  // 12. 급상승순 TOP 10
  //
  // 단순 상승률이 아니라
  // 최근 관심도 + 상승률 + 최근 모멘텀을 종합
  // ============================================================

  const risingTop10 =
    [...trendScores]
      .sort(
        (a, b) =>
          b.risingScore -
          a.risingScore
      )
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        ...item
      }));

  // ============================================================
  // 13. 대표 트렌드 키워드
  // ============================================================

  const topKeyword =
    risingTop10[0]?.keyword ||
    overallTop10[0]?.keyword ||
    "실시간 트렌드";

  // ============================================================
  // 14. YouTube Shorts
  // ============================================================

  let youtubeShorts = [];

  if (env.YOUTUBE_API_KEY) {
    try {
      const ytUrl =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet` +
        `&maxResults=6` +
        `&q=${encodeURIComponent(
          topKeyword + " #shorts"
        )}` +
        `&type=video` +
        `&videoDuration=short` +
        `&order=date` +
        `&key=${env.YOUTUBE_API_KEY}`;

      const ytRes =
        await fetch(ytUrl);

      if (ytRes.ok) {
        const ytData =
          await ytRes.json();

        youtubeShorts =
          (ytData.items || [])
            .filter(
              (item) =>
                item.id &&
                item.id.videoId
            )
            .map((item) => ({
              title:
                item.snippet?.title ||
                "",

              videoId:
                item.id.videoId,

              thumbnail:
                item.snippet?.thumbnails
                  ?.high?.url ||
                item.snippet?.thumbnails
                  ?.medium?.url ||
                item.snippet?.thumbnails
                  ?.default?.url ||
                "",

              channel:
                item.snippet
                  ?.channelTitle ||
                "",

              publishedAt:
                item.snippet
                  ?.publishedAt ||
                ""
            }));
      }

    } catch (error) {
      console.error(
        "YouTube API error:",
        error
      );
    }
  }

  // ============================================================
  // 15. RESPONSE
  // ============================================================

  const responsePayload = {
    // 대표 트렌드
    topKeyword,

    // 전체 인기/안정 관심도
    overallTop10,

    // 급상승
    risingTop10,

    // 모든 후보의 상세 데이터
    leaderboard:
      [...trendScores].sort(
        (a, b) =>
          b.risingScore -
          a.risingScore
      ),

    // YouTube
    youtubeShorts,

    // 메타데이터
    updatedAt:
      new Date().toISOString(),

    // 데이터 설명
    meta: {
      source: [
        "Naver DataLab",
        "YouTube"
      ],

      period: {
        startDate,
        endDate
      },

      overallDescription:
        "최근 30일 동안 상대적으로 꾸준한 관심을 보인 키워드",

      risingDescription:
        "최근 7일의 관심도와 이전 기간 대비 상승세를 종합한 급상승 지표",

      note:
        "Naver DataLab ratio는 키워드별 독립 정규화 값이므로 전체 인기순은 절대 검색량 순위가 아닙니다."
    }
  };

  // ============================================================
  // 16. JSON
  // ============================================================

  const jsonString =
    JSON.stringify(responsePayload);

  // ============================================================
  // 17. KV 저장
  // ============================================================

  if (env.TRENDIVE_KV) {
    try {
      await env.TRENDIVE_KV.put(
        "trendive_data",
        jsonString,
        {
          expirationTtl: 7200
        }
      );
    } catch (e) {
      console.error(
        "KV write error:",
        e
      );
    }
  }

  // ============================================================
  // 18. RESPONSE
  // ============================================================

  return new Response(
    jsonString,
    {
      headers: {
        "Content-Type":
          "application/json;charset=UTF-8",

        "Cache-Control":
          "public, max-age=7200"
      }
    }
  );
}
