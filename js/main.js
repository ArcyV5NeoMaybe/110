document.addEventListener("DOMContentLoaded",()=>{
    const panel=document.getElementById("panel");
    const flagButton=document.getElementById("flagButton");
    if(flagButton&&panel){
        flagButton.addEventListener("click",()=>panel.classList.toggle("open"));
    }
});
