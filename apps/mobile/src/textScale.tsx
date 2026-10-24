// G14 text size: Normal / Large / Extra large from the patient's settings scales every Text and
// Button label. The provider sits under ConvexProvider in the root layout.
import { useQuery } from 'convex/react';
import { createContext, useContext, type ReactNode } from 'react';

import { api } from '../../../convex/_generated/api';

const SCALE = { normal: 1, large: 1.15, xlarge: 1.3 } as const;

const TextScale = createContext(1);

export function TextScaleProvider({ children }: { children: ReactNode }) {
  const patient = useQuery(api.patients.getDemo);
  return <TextScale.Provider value={SCALE[patient?.textSize ?? 'normal']}>{children}</TextScale.Provider>;
}

export function useTextScale(): number {
  return useContext(TextScale);
}
