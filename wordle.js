const words = ["poop", "turd", "fart"];
let firstWord = words[0];

let boxes = document.querySelectorAll('#row1 .square');

let boxIndex = 0;

let inputArray = [];

window.addEventListener('DOMContentLoaded', () => {
    boxes[boxIndex].focus();


    boxes.forEach((box) => {


        box.addEventListener('keyup', (e) => {

            if (box.value.length === 1) {
                inputArray.push(box.value);
                boxIndex++;
                if (boxIndex < boxes.length) {
                    boxes[boxIndex].focus();
                }
            }

            if (boxIndex === boxes.length) { // all boxes filled
                    let inputtedWord = inputArray.join('');
                    console.log(inputtedWord);

                    if (inputtedWord === firstWord) {
                        console.log("You win!" + ` The word was ${firstWord}`);
                    }
                    else {
                        console.log("Try again!");
                    }
            }


        
        });

    });






});