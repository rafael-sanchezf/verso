import { useLocalSearchParams } from 'expo-router';

import { AddSheet } from '@/screens/search/add-sheet';

export default function AddTo() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <AddSheet id={id} />;
}
