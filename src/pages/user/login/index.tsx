import { history } from '@umijs/max';
import React from 'react';

const Login: React.FC = () => {
  React.useEffect(() => {
    history.replace('/workspace');
  }, []);

  return null;
};

export default Login;
