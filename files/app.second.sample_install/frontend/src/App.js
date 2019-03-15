
import Calculator from './Calculator';
import React from 'react';
import { Text, TextInput, StyleSheet, View } from 'react-native';

// const App = () => (
//   <View style={styles.container}>
//     <Calculator />
//   </View>
// );

class App extends React.Component {
  constructor(props){
    super(props);
    this.state = {
      last: 0,
      touches: 0
    }
    window.setInterval(()=>{
      this.setState({
        last: window.lastCheck,
        now: Date.now(),
        elapsed: (Date.now() - window.lastCheck)
      });
    },1000)
  }

  handleTouchStart = (e) => {
    this.setState({touches: e.touches.length});
    if(e.touches.length >= 3){
      window.checkLatestVersion();
    }
  }
  handleTouchEnd = (e) => {
    this.setState({touches: e.touches.length});
    // state=>{
    //   return {
    //     touches: state.touches - 1
    //   }
    // })
  }
  render() {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }} onTouchStart={this.handleTouchStart} onTouchEnd={this.handleTouchEnd} onTouchCancel={this.handleTouchEnd}>
        <Text>Hello World! (2)</Text>
        <TextInput
          autoFocus={true}
          multiline={true}
          accessibilityLabel="I am the accessibility label for text input"
        />
      </View>
    )
  }
}


const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', flex: 1 }
});

export default App