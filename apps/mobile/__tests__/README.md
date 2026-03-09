# Mobile Testing


## Run
```bash
npx jest
```

## Example

Update `src/app/index.jsx` to:
```jsx
import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export const CustomText = ({ children }) => <Text>{children}</Text>;

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <CustomText>Welcome!</CustomText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

Create `__tests__/HomeScreen-test.jsx` with:
```jsx
import { render } from '@testing-library/react-native';

import HomeScreen, { CustomText } from '@/app/index';

describe('<HomeScreen />', () => {
    test('Text renders correctly on HomeScreen', () => {
        const { getByText } = render(<HomeScreen />);

        getByText('Welcome!');
    });
});
```


