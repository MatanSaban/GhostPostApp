'use client';

import { useRef, Children } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import styles from '../page.module.css';

export function KpiSlider({ children, interval = 4000 }) {
  const swiperRef = useRef(null);
  const items = Children.toArray(children);

  return (
    <div
      className={styles.kpiSlider}
      onMouseEnter={() => swiperRef.current?.autoplay?.stop()}
      onMouseLeave={() => swiperRef.current?.autoplay?.start()}
    >
      <Swiper
        modules={[Autoplay, Pagination]}
        onSwiper={(sw) => { swiperRef.current = sw; }}
        slidesPerView={3}
        slidesPerGroup={1}
        spaceBetween={16}
        grabCursor
        autoplay={{ delay: interval, disableOnInteraction: false, pauseOnMouseEnter: true }}
        loop
        pagination={{ clickable: true }}
        breakpoints={{
          0: { slidesPerView: 1.15 },
          480: { slidesPerView: 2 },
          768: { slidesPerView: 3 },
        }}
        className={styles.kpiSliderTrack}
      >
        {items.map((child, i) => (
          <SwiperSlide key={i} className={styles.kpiSliderSlide}>
            {child}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
