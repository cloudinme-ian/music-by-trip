// API 키 없이 확인하기 위한 샘플: AI가 줄 장소 곡 2곡 + 여행지 프로필 (무드 곡 3곡은 matcher가 실제로 고른다)
export const SAMPLE = {
  destination: '교토',
  code: 'KYO',
  summary: '천년 고도의 돌담길과 사찰의 고요함, 가모강변의 느린 저녁이 어우러진 도시.',
  profile: { country: 'JP', season: '가을', scenery: ['유적·고도', '골목', '호수·강'], vibes: ['고요', '낭만', '레트로'] },
  tracks: [
    { title: 'Plastic Love', artist: 'Mariya Takeuchi', year: 1984, source: 'live', videoId: null,
      reason: '가와라마치의 저녁 불빛 아래 걷기 좋은 시티팝의 대표곡.' },
    { title: 'Kyoto', artist: 'Phoebe Bridgers', year: 2020, source: 'live', videoId: null,
      reason: '도시 이름을 제목에 담은 곡, 여행지에서 떠오르는 복잡한 마음을 노래합니다.' },
  ],
};
