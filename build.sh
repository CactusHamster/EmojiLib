SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd $SCRIPT_DIR

cd ./src
npm install
cd ../
case "$OSTYPE" in
  solaris*) os="linuxstatic" ;;
  darwin*)  os="macos" ;; 
  linux*)   os="linux" ;;
  bsd*)     os="freebsd" ;;
  msys*)    os="windows" ;;
  cygwin*)  os="windows" ;;
  *)        os="unknown" ;;
esac
echo "Compiling for OS $os."
echo $( npx pkg ./src --targets latest-$os-x64 )
