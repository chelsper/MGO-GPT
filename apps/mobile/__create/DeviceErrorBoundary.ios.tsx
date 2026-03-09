import React, { type ReactNode, useCallback, useEffect, useState } from 'react';
import { SharedErrorBoundary, Button } from './SharedErrorBoundary';
import * as Updates from 'expo-updates';
import { SplashScreen } from 'expo-router/build/exports';
import { DevSettings, LogBox, Platform, View } from 'react-native';
import { isErrorLike, serializeError } from 'serialize-error';
import { reportErrorToRemote } from './report-error-to-remote';
import { errorFixEmitter, ErrorFixEvents } from '@anythingai/app/utils';

type ErrorBoundaryState = {
  hasError: boolean;
  error: unknown | null;
  sentLogs: boolean;
};

const DeviceErrorBoundary = ({
  sentLogs,
  error,
}: {
  sentLogs: boolean;
  error: unknown | null;
}) => {
  const isAnythingApp = process.env.EXPO_PUBLIC_IS_ANYTHING_APP === 'true';
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => { });
  }, []);
  const handleFixClick = useCallback(() => {
    const seraizliedError = serializeError(error);
    const displayableError = isErrorLike(seraizliedError)
      ? `${seraizliedError.message}\n\n${seraizliedError.stack}`
      : JSON.stringify(seraizliedError, null, 2);
    errorFixEmitter.emit(ErrorFixEvents.ERROR_FIX_SUBMITTED, {
      error: displayableError,
    });
  }, [error]);
  const handleReload = useCallback(async () => {
    if (Platform.OS === 'web') {
      window.location.reload();
      return;
    }

    Updates.reloadAsync().catch((error) => {
      // no-op, we don't want to show an error here
    });
  }, []);
  return (
    <SharedErrorBoundary
      isOpen
      description={
        sentLogs && !isAnythingApp
          ? 'It looks like an error occurred while trying to use your app. This error has been reported to the AI agent and should be visible to the AI soon. If it is not present please see anything.com/docs for help'
          : 'It looks like an error occurred while trying to use your app. Please see anything.com/docs for help'
      }
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {isAnythingApp && (
          <Button color="primary" onPress={handleFixClick}>
            Try to fix
          </Button>
        )}
        {!isAnythingApp && (
          <Button color="primary" onPress={handleReload}>
            Restart app
          </Button>
        )}
      </View>
    </SharedErrorBoundary>
  );
};

export class DeviceErrorBoundaryWrapper extends React.Component<
  {
    children: ReactNode;
  },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    sentLogs: false,
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error, sentLogs: false };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    this.setState({ error });
    reportErrorToRemote({ error })
      .then(({ success, error: fetchError }) => {
        this.setState({ hasError: true, sentLogs: success });
      })
      .catch((reportError) => {
        this.setState({ hasError: true, sentLogs: false });
      });
  }

  render() {
    if (this.state.hasError) {
      return <DeviceErrorBoundary error={this.state.error} sentLogs={this.state.sentLogs} />;
    }
    return this.props.children;
  }
}
