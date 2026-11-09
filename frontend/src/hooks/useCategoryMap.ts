import { useEffect, useState } from 'react';
import { getCategories } from '../api/categories';
import type { Category } from '../types/category';

/**
 * 거래 카드에 카테고리 이름을 보여주기 위한 {id -> 카테고리} 표.
 * 보조 정보라서 불러오지 못해도 목록 자체는 그대로 보여준다 (이름만 생략).
 */
export function useCategoryMap(): Map<number, Category> {
  const [categories, setCategories] = useState<Map<number, Category>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    getCategories(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setCategories(new Map(list.map((category) => [category.id, category])));
      })
      .catch(() => {
        // 카테고리 이름은 없어도 되므로 조용히 넘어간다.
      });
    return () => controller.abort();
  }, []);

  return categories;
}
